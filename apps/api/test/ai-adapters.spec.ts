import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { DataSource } from 'typeorm';
import { AssistantConfig } from '../src/ai/assistant.config';
import { EndpointPolicy, permittedAddress } from '../src/ai/endpoint-policy';
import { CredentialsService } from '../src/ai/credentials.service';
import { UserModelProvider } from '../src/ai/user-model.provider';
import { ConnectionsService } from '../src/ai/connections.service';
import { ProjectEmbeddings } from '../src/ai/project-embeddings';
import { AiConnection, ConnectionProvider } from '../src/ai/entities/ai.entities';
import { tokenChunks } from '../src/ai/token-chunks';
import { validateCitations } from '../src/ai/assistant-workflow';
import type { GenerationRequest } from '../src/ai/providers';
const keys = { v1: randomBytes(32).toString('base64'), v2: randomBytes(32).toString('base64') };
const configuration = (extra: Record<string, string> = {}) =>
  new AssistantConfig(
    new ConfigService({
      AI_ENABLED: 'true',
      RAG_ENABLED: 'true',
      AI_ENCRYPTION_KEYS: JSON.stringify(keys),
      ...extra,
    }),
  );
const context: GenerationRequest['sourceContext'] = {
  applicationInstructions: 'Read sources safely.',
  action: 'EXPLAIN',
  language: 'en',
  bookExcerpts: [],
  personalNotes: [],
  conversationHistory: [],
  limitations: [],
  textLength: 0,
};
describe('Native LangChain adapters (HTTP fixtures only, no live AI)', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each<ConnectionProvider>(['openai', 'compatible', 'anthropic', 'gemini', 'ollama'])(
    '%s uses the user connection, validates text and reports actual usage',
    async (provider) => {
      const c = {
        id: 'connection',
        userId: 'owner',
        provider,
        baseUrl:
          provider === 'gemini'
            ? 'https://generativelanguage.googleapis.com'
            : 'https://fixture.example/v1',
        model: 'test-model',
        validation: 'VALID',
        validatedModels: ['test-model'],
        streaming: false,
        revision: 1,
      } as AiConnection;
      const connections = {
        resolve: jest.fn(async () => ({
          connection: c,
          apiKey: provider === 'compatible' ? undefined : 'USER-secret',
        })),
        owned: jest.fn(async () => c),
        view: (value: unknown) => value,
      } as unknown as ConnectionsService;
      const update = jest.fn(async () => ({ affected: 1 }));
      const json =
        provider === 'anthropic'
          ? {
              id: 'msg_fixture',
              type: 'message',
              role: 'assistant',
              model: 'test-model',
              content: [{ type: 'text', text: 'Fixture response' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 7, output_tokens: 3 },
            }
          : provider === 'gemini'
            ? {
                candidates: [
                  {
                    content: { role: 'model', parts: [{ text: 'Fixture response' }] },
                    finishReason: 'STOP',
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 7,
                  candidatesTokenCount: 3,
                  totalTokenCount: 10,
                },
              }
            : provider === 'ollama'
              ? {
                  model: 'test-model',
                  message: { role: 'assistant', content: 'Fixture response' },
                  done: true,
                  done_reason: 'stop',
                  prompt_eval_count: 7,
                  eval_count: 3,
                }
              : {
                  id: 'chatcmpl-fixture',
                  object: 'chat.completion',
                  created: 1,
                  model: 'test-model',
                  choices: [
                    {
                      index: 0,
                      message: { role: 'assistant', content: 'Fixture response' },
                      finish_reason: 'stop',
                    },
                  ],
                  usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
                };
      const transport = jest.fn(
        async () =>
          new Response(JSON.stringify(json) + (provider === 'ollama' ? '\n' : ''), {
            headers: {
              'content-type': provider === 'ollama' ? 'application/x-ndjson' : 'application/json',
            },
          }),
      );
      jest.spyOn(globalThis, 'fetch').mockImplementation(transport);
      const policy = { fetchFor: jest.fn(() => transport) } as unknown as EndpointPolicy;
      const service = new UserModelProvider(connections, policy, configuration(), {
        getRepository: () => ({ update }),
      } as unknown as DataSource);
      const input: GenerationRequest = {
        requestId: 'r',
        connection: { userId: 'owner', connectionId: 'connection' },
        model: 'test-model',
        maxOutputTokens: 64,
        applicationInstructions: 'Read safely',
        userMessages: [],
        sourceContext: context,
      };
      const result = await service.generate(input);
      expect(result).toMatchObject({
        status: 'completed',
        content: 'Fixture response',
        usage: { inputTokens: 7, outputTokens: 3 },
      });
      expect(connections.resolve).toHaveBeenCalledWith('owner', 'connection');
      expect(transport).toHaveBeenCalled();
      const call = transport.mock.calls[0] as unknown as [RequestInfo, RequestInit];
      const headers = new Headers(
        call[1]?.headers ?? (call[0] instanceof Request ? call[0].headers : undefined),
      );
      if (provider === 'compatible') expect(headers.has('authorization')).toBe(false);
      if (provider === 'openai') expect(headers.get('authorization')).toBe('Bearer USER-secret');
      expect(JSON.stringify(input)).not.toContain('USER-secret');
      await service.validate('owner', 'connection', 'test-model');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'connection', userId: 'owner' }),
        expect.objectContaining({ validation: 'VALID' }),
      );
    },
  );
  it('uses the same project embedding model and dimensions for documents and queries, never a user credential', async () => {
    const requests: { input: unknown; headers: Headers }[] = [];
    const policy = {
      fetchFor:
        (_base: string, observer: (json: unknown) => void) =>
        async (_url: unknown, init: RequestInit) => {
          const input = JSON.parse(init.body as string);
          requests.push({ input, headers: new Headers(init.headers) });
          const data = {
            data: [{ index: 0, embedding: [1, 0, 0] }],
            usage: { prompt_tokens: 9, total_tokens: 9 },
          };
          observer(data);
          return new Response(JSON.stringify(data), {
            headers: { 'content-type': 'application/json' },
          });
        },
    } as unknown as EndpointPolicy;
    const embedder = new ProjectEmbeddings(
      configuration({
        PROJECT_EMBEDDING_API_KEY: 'PROJECT-only',
        PROJECT_EMBEDDING_DIMENSIONS: '3',
      }),
      policy,
    );
    for (const purpose of ['document', 'query'] as const)
      expect(await embedder.process(['A passage'], purpose)).toMatchObject({
        vectors: [[1, 0, 0]],
        usage: { inputTokens: 9 },
      });
    for (const item of requests) {
      expect(item.input).toMatchObject({ model: 'text-embedding-3-small', dimensions: 3 });
      expect(item.headers.get('authorization')).toBe('Bearer PROJECT-only');
    }
  });
  it('refuses fallback without a user-owned connection', async () => {
    const provider = new UserModelProvider(
      {} as ConnectionsService,
      {} as EndpointPolicy,
      configuration(),
      {} as DataSource,
    );
    await expect(
      provider.generate({
        requestId: 'r',
        model: 'test',
        maxOutputTokens: 64,
        applicationInstructions: '',
        userMessages: [],
        sourceContext: context,
      }),
    ).rejects.toThrow('no project LLM fallback');
  });
});
describe('Endpoint and credential boundaries', () => {
  it.each([
    '127.0.0.1',
    '::1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::ffff:127.0.0.1',
    '100.100.100.200',
    '0.0.0.0',
    '224.0.0.1',
  ])('rejects unauthorized destination %s', (ip) =>
    expect(permittedAddress(ip, false)).toBe(false),
  );
  it('never allows metadata even with a private endpoint allowlist', () => {
    expect(permittedAddress('169.254.169.254', true)).toBe(false);
    expect(permittedAddress('127.0.0.1', true)).toBe(true);
    const policy = new EndpointPolicy(configuration());
    for (const url of [
      'http://example.com',
      'https://user:secret@example.com',
      'https://example.com?key=secret',
      'https://metadata.google.internal',
    ])
      expect(() => policy.validate(url)).toThrow();
  });
  it('checks addresses before requests, forbids redirects/cross-origin calls and caps responses', async () => {
    let hits = 0;
    const server = createServer((req, res) => {
      hits++;
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/destination' });
        res.end();
      } else if (req.url === '/large') {
        res.end('x'.repeat(2 * 1024 * 1024 + 1));
      } else res.end('ok');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await expect(new EndpointPolicy(configuration()).resolve(origin)).rejects.toThrow();
      const policy = new EndpointPolicy(configuration({ AI_ALLOWED_PRIVATE_ORIGINS: origin }));
      const transport = policy.fetchFor(origin),
        resolve = jest.spyOn(policy, 'resolve');
      expect(await (await transport(origin)).text()).toBe('ok');
      await expect(transport(origin + '/redirect')).rejects.toThrow();
      expect(hits).toBe(2);
      await expect(transport('https://different.example/')).rejects.toThrow('origin');
      await expect((await transport(origin + '/large')).text()).rejects.toThrow('limits');
      expect(resolve).toHaveBeenCalledTimes(3);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
  it('supports key version rotation and authenticated owner/connection binding', () => {
    const old = new CredentialsService(configuration()),
      cipher = old.encrypt('owner', 'connection', 'secret');
    const rotated = new CredentialsService(configuration({ AI_ENCRYPTION_KEY_VERSION: 'v2' }));
    expect(rotated.decrypt('owner', 'connection', cipher)).toBe('secret');
    expect(rotated.encrypt('owner', 'connection', 'replacement')).toMatch(/^v2\./);
    for (const value of [cipher.replace(/^v1/, 'v2'), cipher.slice(0, -4) + 'AAAA'])
      expect(() => rotated.decrypt('owner', 'connection', value)).toThrow();
    expect(() => rotated.decrypt('intruder', 'connection', cipher)).toThrow();
    expect(() => rotated.decrypt('owner', 'other-connection', cipher)).toThrow();
  });
});
describe('Token chunks and citation checks', () => {
  it('preserves Unicode source spans deterministically and bounds oversized paragraphs by real tokens', () => {
    const text = 'A paragraph about forests.\n\nاردو عبارت 🌲 '.repeat(60);
    const chunks = tokenChunks(text, 7, 'book:configuration', 64, 12);
    expect(chunks.length).toBeGreaterThan(5);
    expect(tokenChunks(text, 7, 'book:configuration', 64, 12)).toEqual(chunks);
    const covered = new Set<number>();
    for (const chunk of chunks) {
      expect(chunk.tokens).toBeLessThanOrEqual(64);
      const span = chunk.spans[0];
      expect(span.page).toBe(7);
      expect(text.slice(span.start, span.end)).toBe(chunk.text);
      expect(chunk.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
      for (let i = span.start; i < span.end; i++) covered.add(i);
    }
    expect(covered.size).toBe(text.length);
    expect(tokenChunks('', 1, 'b', 64, 12)).toEqual([]);
    expect(tokenChunks('   ', 1, 'b', 64, 12)).toEqual([]);
    expect(() => tokenChunks('x', 1, 'b', 64, 64)).toThrow();
    expect(tokenChunks(text, 7, 'other-version', 64, 12)[0].stableId).not.toBe(chunks[0].stableId);
  });
  it('removes invented citation identifiers and retains only supplied references', () => {
    const source = {
      sourceType: 'BOOK_TEXT' as const,
      bookId: 'book',
      documentVersion: 'book',
      sourceTitle: 'Actual title',
      pages: { first: 3, last: 3 },
    };
    const result = validateCitations('Supported [S1]. Invented [S999].', [
      { id: 'S1', text: 'Source statement', score: 1, source },
    ]);
    expect(result.answer).not.toContain('[S999]');
    expect(result.citations).toEqual([{ id: 'S1', source, excerpt: 'Source statement' }]);
  });
});
