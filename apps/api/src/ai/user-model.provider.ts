import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ConnectionsService } from './connections.service';
import { AiConnection } from './entities/ai.entities';
import { EndpointPolicy } from './endpoint-policy';
import { AssistantConfig } from './assistant.config';
import { safeProviderFailure, ProviderFailure } from './project-embeddings';
import type { GenerationRequest, GenerationResult, TextGenerator, TextStreamer } from './providers';
import type { GenerationEvent, ProviderUsage } from './contracts';

export const USER_MODEL = Symbol('USER_MODEL');
export interface UserModel extends TextGenerator, TextStreamer {
  validate(
    userId: string,
    connectionId: string,
    model: string,
  ): Promise<{ connection: ReturnType<ConnectionsService['view']>; usage?: ProviderUsage }>;
  models(userId: string, connectionId: string): Promise<string[]>;
}
function content(message: AIMessage | AIMessageChunk) {
  return typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((x) => x.type === 'text')
        .map((x) => String(x.text ?? ''))
        .join('');
}
@Injectable()
export class UserModelProvider implements UserModel {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly policy: EndpointPolicy,
    private readonly config: AssistantConfig,
    private readonly db: DataSource,
  ) {}
  private async adapter(
    userId: string,
    connectionId: string,
    model: string,
    output: number,
    validating = false,
  ): Promise<{ model: BaseChatModel; connection: AiConnection }> {
    this.config.validate();
    const { connection: c, apiKey } = await this.connections.resolve(userId, connectionId);
    if (['openai', 'anthropic', 'gemini'].includes(c.provider) && !apiKey)
      throw new ProviderFailure('CREDENTIALS');
    if (!this.config.connectionsEnabled)
      throw new BadRequestException('AI connection storage is unavailable.');
    if (!validating && (c.validation !== 'VALID' || !c.validatedModels.includes(model)))
      throw new BadRequestException(
        'Validate this connection and model in AI Settings before using it.',
      );
    const transport = this.policy.fetchFor(c.baseUrl);
    let adapter: BaseChatModel;
    if (c.provider === 'openai' || c.provider === 'compatible') {
      // Keyless compatible endpoints are supported; the transport removes the SDK placeholder header.
      const fetch: typeof globalThis.fetch = (url, init) => {
        const headers = new Headers(init?.headers);
        if (!apiKey) headers.delete('authorization');
        return transport(url, { ...init, headers });
      };
      adapter = new ChatOpenAI({
        apiKey: apiKey ?? 'keyless-transport',
        model,
        maxTokens: output,
        timeout: this.config.timeout,
        maxRetries: 0,
        configuration: { baseURL: c.baseUrl, fetch },
        streaming: c.streaming,
        streamUsage: c.provider === 'openai',
        useResponsesApi: false,
      });
    } else if (c.provider === 'anthropic')
      adapter = new ChatAnthropic({
        apiKey: apiKey!,
        model,
        maxTokens: output,
        maxRetries: 0,
        clientOptions: { fetch: transport, timeout: this.config.timeout },
      });
    else if (c.provider === 'gemini')
      adapter = new ChatGoogleGenerativeAI({
        apiKey: apiKey!,
        model,
        maxOutputTokens: output,
        maxRetries: 0,
      });
    else
      adapter = new ChatOllama({
        model,
        baseUrl: c.baseUrl,
        fetch: transport,
        maxRetries: 0,
        numPredict: output,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
    return { model: adapter, connection: c };
  }
  async *stream(request: GenerationRequest): AsyncIterable<GenerationEvent> {
    if (!request.connection)
      throw new BadRequestException(
        'A user-owned connection is required; no project LLM fallback exists.',
      );
    const { userId, connectionId } = request.connection;
    const { model, connection } = await this.adapter(
      userId,
      connectionId,
      request.model,
      request.maxOutputTokens,
    );
    const source = request.sourceContext;
    const messages = [
      new SystemMessage(request.applicationInstructions),
      ...request.userMessages.map((m) =>
        m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content),
      ),
      new HumanMessage(
        JSON.stringify({
          action: source.action,
          language: source.language,
          question: source.userQuestion?.text,
          untrustedBookExcerpts: source.bookExcerpts.map((p, i) => ({
            id: `S${i + 1}`,
            text: p.text,
            provenance: p.provenance,
          })),
          untrustedPersonalNotes: source.personalNotes.map((p) => p.text),
        }),
      ),
    ];
    // UTF-8 bytes are a conservative bound independent of unknown/custom model tokenizers.
    if (
      Buffer.byteLength(messages.map((m) => String(m.content)).join(''), 'utf8') >
      this.config.inputBytes
    )
      throw new BadRequestException(
        'Prompt exceeds the configured input limit. Shorten the selection or question.',
      );
    const signal = AbortSignal.any([
      AbortSignal.timeout(this.config.timeout),
      ...(request.signal ? [request.signal] : []),
    ]);
    let answer = '',
      usage: ProviderUsage | undefined;
    let actualModel = request.model;
    let finishReason: 'stop' | 'output_limit' = 'stop';
    yield { type: 'started', requestId: request.requestId };
    try {
      const consume = (message: AIMessage | AIMessageChunk) => {
        const delta = content(message);
        answer += delta;
        if (answer.length > 65536) throw new ProviderFailure('INCOMPATIBLE');
        if (message.usage_metadata)
          usage = {
            inputTokens: (usage?.inputTokens ?? 0) + message.usage_metadata.input_tokens,
            outputTokens: (usage?.outputTokens ?? 0) + message.usage_metadata.output_tokens,
          };
        const reported = message.response_metadata?.model_name ?? message.response_metadata?.model;
        if (typeof reported === 'string') actualModel = reported;
        const finish =
          message.response_metadata?.finish_reason ??
          message.response_metadata?.stop_reason ??
          message.response_metadata?.finishReason ??
          message.response_metadata?.done_reason;
        if (typeof finish === 'string')
          finishReason = /length|max_tokens/i.test(finish) ? 'output_limit' : 'stop';
        return delta;
      };
      if (connection.streaming)
        for await (const chunk of await model.stream(messages, { signal, callbacks: [] })) {
          const delta = consume(chunk);
          if (delta) yield { type: 'text_delta', text: delta };
        }
      else {
        const delta = consume(await model.invoke(messages, { signal, callbacks: [] }));
        if (delta) yield { type: 'text_delta', text: delta };
      }
      if (!answer.trim()) throw new ProviderFailure('INCOMPATIBLE');
      yield {
        type: 'completed',
        content: answer,
        finishReason,
        usage,
        model: actualModel,
        provider: connection.provider,
      };
    } catch (error) {
      const safe = safeProviderFailure(error, signal);
      if (safe.code === 'CREDENTIALS')
        await this.db
          .getRepository(AiConnection)
          .update(
            { id: connectionId, userId, revision: connection.revision },
            { validation: 'INVALID', validatedModels: [] },
          );
      if (signal.aborted) yield { type: 'cancelled', partialContent: answer, usage };
      else
        yield {
          type: 'failed',
          error: { code: 'PROVIDER_FAILED', message: safe.message, retryable: safe.retryable },
          usage,
        };
    }
  }
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    let answer = '';
    for await (const event of this.stream(request)) {
      if (event.type === 'text_delta') answer += event.text;
      if (event.type === 'completed')
        return {
          status: 'completed',
          content: event.content,
          finishReason: event.finishReason,
          usage: event.usage,
        };
      if (event.type === 'cancelled')
        return { status: 'cancelled', content: answer, usage: event.usage };
      if (event.type === 'failed') throw new BadRequestException(event.error.message);
    }
    throw new ProviderFailure('TEMPORARY');
  }
  async validate(userId: string, connectionId: string, modelName: string) {
    const { model, connection } = await this.adapter(userId, connectionId, modelName, 16, true);
    try {
      const opts = { signal: AbortSignal.timeout(this.config.timeout), callbacks: [] };
      let answer = '';
      let usage: ProviderUsage | undefined;
      const consume = (part: AIMessage | AIMessageChunk) => {
        answer += content(part);
        if (answer.length > 4096) throw new ProviderFailure('INCOMPATIBLE');
        if (part.usage_metadata)
          usage = {
            inputTokens: (usage?.inputTokens ?? 0) + part.usage_metadata.input_tokens,
            outputTokens: (usage?.outputTokens ?? 0) + part.usage_metadata.output_tokens,
          };
      };
      if (connection.streaming)
        for await (const part of await model.stream('Reply with OK.', opts)) consume(part);
      else consume(await model.invoke('Reply with OK.', opts));
      if (!answer.trim()) throw new ProviderFailure('INCOMPATIBLE');
      await this.db.getRepository(AiConnection).update(
        { id: connectionId, userId, revision: connection.revision },
        {
          validation: 'VALID',
          validatedAt: new Date(),
          validatedModels: [...new Set([...connection.validatedModels, modelName])].slice(-30),
        },
      );
      return {
        connection: this.connections.view(await this.connections.owned(userId, connectionId)),
        usage,
      };
    } catch (error) {
      const safe = safeProviderFailure(error);
      if (safe.code === 'CREDENTIALS')
        await this.db
          .getRepository(AiConnection)
          .update(
            { id: connectionId, userId, revision: connection.revision },
            { validation: 'INVALID', validatedAt: new Date(), validatedModels: [] },
          );
      throw new BadRequestException(
        safe.message +
          (connection.streaming && safe.code === 'INCOMPATIBLE'
            ? ' Disable streaming and validate again if this endpoint supports completed responses only.'
            : ''),
      );
    }
  }
  async models(userId: string, connectionId: string) {
    const { connection: c, apiKey } = await this.connections.resolve(userId, connectionId);
    if (!this.config.connectionsEnabled)
      throw new BadRequestException('AI connections are unavailable.');
    if (['openai', 'anthropic', 'gemini'].includes(c.provider) && !apiKey)
      throw new ProviderFailure('CREDENTIALS');
    const headers: Record<string, string> = {};
    let path = '/models';
    if (c.provider === 'anthropic') {
      headers['x-api-key'] = apiKey!;
      headers['anthropic-version'] = '2023-06-01';
      path = '/v1/models';
    } else if (c.provider === 'gemini') {
      headers['x-goog-api-key'] = apiKey!;
      path = '/v1beta/models';
    } else {
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (c.provider === 'ollama') path = '/api/tags';
    }
    try {
      const response = await this.policy.fetchFor(c.baseUrl)(c.baseUrl + path, { headers });
      if (!response.ok) throw { status: response.status };
      const data = (await response.json()) as {
        data?: { id: string }[];
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      return (
        data.data?.map((x) => x.id) ??
        data.models
          ?.filter(
            (x) =>
              c.provider !== 'gemini' || x.supportedGenerationMethods?.includes('generateContent'),
          )
          .map((x) => x.name.replace(/^models\//, '')) ??
        []
      ).slice(0, 500);
    } catch {
      throw new BadRequestException(
        'Model discovery is unavailable for this connection. Enter an exact model identifier and validate it.',
      );
    }
  }
}
