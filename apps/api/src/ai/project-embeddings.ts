import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AssistantConfig } from './assistant.config';
import { EndpointPolicy } from './endpoint-policy';
import type { Embedder } from './providers';
import type { ProviderUsage } from './contracts';
export const PROJECT_EMBEDDER = Symbol('PROJECT_EMBEDDER');
export interface ProjectEmbedder extends Embedder {
  process(
    texts: string[],
    purpose: 'document' | 'query',
    signal?: AbortSignal,
  ): Promise<{ vectors: number[][]; usage?: ProviderUsage }>;
}
export class ProviderFailure extends Error {
  constructor(
    readonly code: 'CREDENTIALS' | 'QUOTA' | 'TEMPORARY' | 'INCOMPATIBLE' | 'CANCELLED',
    readonly retryable = false,
  ) {
    super(
      {
        CREDENTIALS: 'Provider credentials were rejected. Update the connection.',
        QUOTA:
          'Provider quota or rate limit reached. Check the provider account and retry explicitly.',
        TEMPORARY: 'Provider temporarily unavailable. Retry explicitly.',
        INCOMPATIBLE: 'The provider or model does not support this request.',
        CANCELLED: 'Request cancelled; charges may already have been incurred.',
      }[code],
    );
  }
}
export function safeProviderFailure(error: unknown, signal?: AbortSignal): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  if (signal?.aborted) return new ProviderFailure('CANCELLED');
  const status = Number((error as { status?: number })?.status);
  if (status === 401 || status === 403) return new ProviderFailure('CREDENTIALS');
  if (status === 429) return new ProviderFailure('QUOTA');
  if (status >= 400 && status < 500) return new ProviderFailure('INCOMPATIBLE');
  return new ProviderFailure('TEMPORARY', true);
}
@Injectable()
export class ProjectEmbeddings implements ProjectEmbedder {
  constructor(
    private readonly config: AssistantConfig,
    private readonly policy: EndpointPolicy,
  ) {}
  async process(texts: string[], purpose: 'document' | 'query', signal?: AbortSignal) {
    if (!this.config.embeddingReady)
      throw new ServiceUnavailableException(
        'Project embedding service is not configured. Selection assistance is still available with a validated user connection.',
      );
    const selected = this.config.embedding;
    let usage: ProviderUsage | undefined;
    const transport = this.policy.fetchFor(selected.endpoint, (value) => {
      const count = (value as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens;
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
        usage = { inputTokens: count };
    });
    const embeddings = new OpenAIEmbeddings({
      apiKey: this.config.get('PROJECT_EMBEDDING_API_KEY'),
      model: selected.model,
      dimensions: selected.dimensions,
      stripNewLines: false,
      batchSize: this.config.batchSize,
      maxRetries: 0,
      maxConcurrency: 1,
      timeout: this.config.timeout,
      configuration: {
        baseURL: selected.endpoint,
        fetch: (url, init) =>
          transport(url, {
            ...init,
            signal: AbortSignal.any([
              ...(signal ? [signal] : []),
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      },
    });
    try {
      const vectors =
        purpose === 'query'
          ? [await embeddings.embedQuery(texts[0])]
          : await embeddings.embedDocuments(texts);
      if (
        vectors.length !== texts.length ||
        vectors.some(
          (v) =>
            v.length !== selected.dimensions ||
            v.some((n) => !Number.isFinite(n)) ||
            !v.some((n) => n !== 0),
        )
      )
        throw new ProviderFailure('INCOMPATIBLE');
      return { vectors, usage };
    } catch (error) {
      const safe = safeProviderFailure(error, signal);
      if (safe.code === 'CREDENTIALS')
        safe.message =
          'Project embedding credentials were rejected. Ask the administrator to update them; selection assistance remains available.';
      if (safe.code === 'QUOTA')
        safe.message =
          'Project embedding quota or rate limit reached. Try later or contact the administrator; selection assistance remains available.';
      if (safe.code === 'TEMPORARY')
        safe.message =
          'Project embedding service is temporarily unavailable. Try later; selection assistance remains available.';
      throw safe;
    }
  }
  async embed(request: Parameters<Embedder['embed']>[0]) {
    if (request.model !== this.config.embedding.model) throw new ProviderFailure('INCOMPATIBLE');
    return {
      ...(await this.process([...request.texts], 'document', request.signal)),
      identity: {
        provider: 'openai',
        model: this.config.embedding.model,
        dimensions: this.config.embedding.dimensions,
      },
    };
  }
}
