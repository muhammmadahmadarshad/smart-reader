import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http';
import { AuthService } from '../src/auth/auth.service';
import { BooksService } from '../src/books/books.service';
import { Book } from '../src/books/entities/book.entity';
import { User } from '../src/users/entities/user.entity';
import { AssistantConfig } from '../src/ai/assistant.config';
import { ConnectionsService } from '../src/ai/connections.service';
import { CredentialsService } from '../src/ai/credentials.service';
import { EndpointPolicy } from '../src/ai/endpoint-policy';
import { IndexingService, PDF_EXTRACTOR } from '../src/ai/indexing.service';
import { PROJECT_EMBEDDER, ProviderFailure } from '../src/ai/project-embeddings';
import { USER_MODEL } from '../src/ai/user-model.provider';
import { ConversationsService } from '../src/ai/conversations.service';
import { RetrievalService } from '../src/ai/retrieval.service';
import { QuotaService } from '../src/ai/quota.service';
import { ReadingContextService } from '../src/ai/reading-context.service';
import {
  AiChunk,
  AiConnection,
  AiIndex,
  AiMessage,
  AiPage,
  AiRun,
  AiUsage,
} from '../src/ai/entities/ai.entities';
import { GenerationRequest } from '../src/ai/providers';
import { GenerationEvent } from '../src/ai/contracts';
const sections = [
  'The opening chapter describes Violet Valley and its purple flowers.',
  'The middle chapter describes Amber Ocean and its orange coral.',
  'The final chapter describes Silver Moon and its white craters.',
];
function vector(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('moon')) return [0, 0, 1];
  if (lower.includes('ocean')) return [0, 1, 0];
  if (lower.includes('valley')) return [1, 0, 0];
  return [1, 1, 1];
}
describe('Phase 6: PostgreSQL/pgvector assistant with test-only adapters', () => {
  let app: INestApplication,
    db: DataSource,
    books: BooksService,
    indexing: IndexingService,
    connections: ConnectionsService,
    conversations: ConversationsService,
    config: AssistantConfig;
  let owner: string,
    other: string,
    cookie: string,
    book: string,
    second: string,
    connectionId: string;
  const createdBooks: string[] = [];
  let pageTexts = [...sections],
    failEmbeddingAfter = 0,
    cancelAfterFirst = false;
  const embed = jest.fn(async (texts: string[], purpose: string) => {
    if (purpose === 'document' && failEmbeddingAfter > 0 && --failEmbeddingAfter === 0) {
      throw new ProviderFailure('TEMPORARY', true);
    }
    return { vectors: texts.map(vector), usage: { inputTokens: 10 } };
  });
  const calls: GenerationRequest[] = [];
  const model = {
    validate: jest.fn(),
    models: jest.fn(),
    generate: jest.fn(),
    async *stream(input: GenerationRequest): AsyncIterable<GenerationEvent> {
      calls.push(input);
      yield { type: 'started', requestId: input.requestId };
      const answer = `${input.sourceContext.bookExcerpts[0]?.text ?? 'No evidence'} [S1]`;
      yield { type: 'text_delta', text: answer };
      if (cancelAfterFirst) {
        yield { type: 'cancelled', partialContent: answer };
        return;
      }
      yield {
        type: 'completed',
        content: answer,
        finishReason: 'stop',
        usage: { inputTokens: 12, outputTokens: 8 },
        model: input.model,
        provider: 'compatible',
      };
    },
  };
  const req = (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) =>
    request(app.getHttpServer())
      [method]('/api' + path)
      .set('Cookie', cookie)
      .set('Origin', process.env.APP_ORIGIN!)
      .set('X-Kevnex-Request', '1')
      .send(body);
  async function upload() {
    const buffer = readFileSync(resolve('../../artifacts/fixtures/text.pdf'));
    const result = await books.upload(owner, {
      originalname: 'Grounding.pdf',
      mimetype: 'application/pdf',
      buffer,
      size: buffer.length,
    } as Express.Multer.File);
    createdBooks.push(result.id);
    return result.id;
  }
  async function prepare(id: string) {
    await indexing.prepare(owner, id);
    const run = await indexing.claim();
    expect(run).not.toBeNull();
    await indexing.process(run!);
    return indexing.status(owner, id);
  }
  beforeAll(async () => {
    config = new AssistantConfig(
      new ConfigService({
        ...process.env,
        AI_ENABLED: 'true',
        RAG_ENABLED: 'true',
        AI_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }),
        PROJECT_EMBEDDING_API_KEY: 'test-only-project-key',
        PROJECT_EMBEDDING_DIMENSIONS: '3',
        EMBEDDING_BATCH_SIZE: '1',
        RAG_MIN_SCORE: '0.8',
      }),
    );
    const startup = jest
      .spyOn(IndexingService.prototype, 'onModuleInit')
      .mockImplementation(() => {});
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AssistantConfig)
      .useValue(config)
      .overrideProvider(PROJECT_EMBEDDER)
      .useValue({ process: embed })
      .overrideProvider(USER_MODEL)
      .useValue(model)
      .overrideProvider(PDF_EXTRACTOR)
      .useValue({
        open: async () => ({
          count: pageTexts.length,
          page: async (n: number) => pageTexts[n - 1],
          close: async () => {},
        }),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    startup.mockRestore();
    db = app.get(DataSource);
    books = app.get(BooksService);
    indexing = app.get(IndexingService);
    connections = app.get(ConnectionsService);
    conversations = app.get(ConversationsService);
    expect(embed).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    const auth = app.get(AuthService);
    owner = (await auth.signup(`ai-${randomUUID()}@example.com`, 'A strong testing passphrase!'))
      .id;
    other = (
      await auth.signup(`ai-other-${randomUUID()}@example.com`, 'A strong testing passphrase!')
    ).id;
    cookie = `kevnex_session=${(await auth.createSession(owner)).token}`;
    book = await upload();
    second = await upload();
    jest.spyOn(app.get(EndpointPolicy), 'resolve').mockResolvedValue({
      url: new URL('https://test.example'),
      addresses: [{ address: '93.184.216.34', family: 4 }],
    });
  });
  afterAll(async () => {
    for (const id of createdBooks)
      if (await db?.getRepository(Book).existsBy({ id })) await books.remove(owner, id);
    if (owner) await db.getRepository(User).delete(owner);
    if (other) await db.getRepository(User).delete(other);
    await app?.close();
  });
  it('does not offer generation without a usable connection, encrypts keys and isolates credentials', async () => {
    expect((await req('get', '/ai/capabilities')).body.generation).toBe(false);
    const key = 'test-secret-key-' + randomUUID();
    const c = await connections.save(owner, {
      name: 'Test connection',
      provider: 'compatible',
      baseUrl: 'https://test.example/v1',
      model: 'fixture-model-a',
      apiKey: key,
      streaming: true,
    });
    connectionId = c.id;
    expect(JSON.stringify(c)).not.toContain(key);
    expect(c.keySuffix).toBe(key.slice(-4));
    const stored = await connections.owned(owner, c.id, true);
    expect(stored.encryptedKey).not.toContain(key);
    expect((await connections.resolve(owner, c.id)).apiKey).toBe(key);
    await expect(connections.resolve(other, c.id)).rejects.toThrow('not found');
    expect(() => app.get(CredentialsService).decrypt(other, c.id, stored.encryptedKey!)).toThrow(
      'cannot be decrypted',
    );
    expect((await req('get', '/ai/capabilities')).body.generation).toBe(false);
    await db.getRepository(AiConnection).update(c.id, {
      validation: 'VALID',
      validatedModels: ['fixture-model-a', 'fixture-model-b'],
      validatedAt: new Date(),
    });
    expect((await req('get', '/ai/capabilities')).body.generation).toBe(true);
    await expect(
      connections.save(
        owner,
        {
          name: 'New endpoint',
          provider: 'compatible',
          baseUrl: 'https://changed.example/v1',
          model: 'fixture-model-a',
        },
        c.id,
      ),
    ).rejects.toThrow('Replace or clear');
    await request(app.getHttpServer()).get('/api/ai/connections').expect(401);
    await request(app.getHttpServer())
      .post('/api/ai/connections')
      .set('Cookie', cookie)
      .send({})
      .expect(403);
  });
  it('selection assistance works before indexing and only receives the owner connection reference', async () => {
    const conversation = await conversations.create(owner, second),
      before = embed.mock.calls.length;
    const question = {
      requestId: randomUUID(),
      conversationId: conversation.id,
      connectionId,
      model: 'fixture-model-a',
      question: 'Explain this.',
      selection: {
        bookId: second,
        documentVersion: second,
        selectedText: 'A browser supplied passage.',
        pages: { first: 1, last: 1 },
        action: 'EXPLAIN' as const,
        language: 'ur',
      },
    };
    const result = await conversations.ask(
      owner,
      second,
      question,
      new AbortController().signal,
      () => {},
    );
    expect(result?.status).toBe('COMPLETED');
    expect(embed).toHaveBeenCalledTimes(before);
    expect(calls.at(-1)?.connection).toEqual({ userId: owner, connectionId });
    expect(calls.at(-1)?.sourceContext.bookExcerpts[0].verifiedDocumentText).toBe(false);
    expect(JSON.stringify(calls.at(-1))).not.toContain('test-secret-key');
    const count = calls.length;
    expect(
      (await conversations.ask(owner, second, question, new AbortController().signal, () => {}))
        ?.id,
    ).toBe(result?.id);
    expect(calls).toHaveLength(count);
    await expect(
      conversations.ask(other, second, question, new AbortController().signal, () => {}),
    ).rejects.toThrow('Book not found');
  });
  it('indexes first, middle and final pages, persists progress and activates only a complete index', async () => {
    await Promise.all([indexing.prepare(owner, book), indexing.prepare(owner, book)]);
    expect(await db.getRepository(AiRun).countBy({ bookId: book })).toBe(1);
    const run = await indexing.claim();
    expect(run).not.toBeNull();
    await indexing.process(run!);
    const status = await indexing.status(owner, book);
    expect(status).toMatchObject({
      status: 'READY',
      ready: true,
      pagesProcessed: 3,
      chunksEmbedded: 3,
      totalChunks: 3,
    });
    expect(status.coverage.textPages).toEqual([1, 2, 3]);
    expect(
      (await db.getRepository(AiChunk).findBy({ bookId: book })).map((c) => c.spans[0].page).sort(),
    ).toEqual([1, 2, 3]);
    const count = embed.mock.calls.length;
    await indexing.prepare(owner, book);
    expect(embed).toHaveBeenCalledTimes(count);
    expect(
      (await db.getRepository(AiUsage).findBy({ userId: owner, kind: 'DOCUMENT_EMBEDDING' })).every(
        (u) => u.provider === 'openai' && u.model === config.embedding.model,
      ),
    ).toBe(true);
  });
  it('retrieves under owner/book/version/index filters and rejects incompatible embedding spaces', async () => {
    const retrieval = app.get(RetrievalService),
      index = await retrieval.ready(owner, book);
    for (const [topic, page] of [
      ['Violet Valley', 1],
      ['Amber Ocean', 2],
      ['Silver Moon', 3],
    ] as const) {
      const passages = await retrieval.search(owner, book, index.id, vector(topic));
      expect(passages[0].source.pages?.first).toBe(page);
      expect(passages.every((p) => p.source.bookId === book)).toBe(true);
    }
    await expect(retrieval.search(other, book, index.id, [1, 0, 0])).rejects.toThrow(
      'Book not found',
    );
    expect(await retrieval.search(owner, second, index.id, [1, 0, 0])).toEqual([]);
    await expect(
      db.query(`UPDATE ai_chunks SET "documentVersion"=$1 WHERE "indexId"=$2`, [
        randomUUID(),
        index.id,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(`UPDATE ai_chunks SET embedding='[1,0]' WHERE "indexId"=$1`, [index.id]),
    ).rejects.toThrow('dimensions');
    const changed = new AssistantConfig(
      new ConfigService({
        ...process.env,
        AI_ENABLED: 'true',
        RAG_ENABLED: 'true',
        PROJECT_EMBEDDING_API_KEY: 'test-only',
        PROJECT_EMBEDDING_DIMENSIONS: '3',
        PROJECT_EMBEDDING_VERSION: 'different-space',
      }),
    );
    await expect(new RetrievalService(db, books, changed).ready(owner, book)).rejects.toThrow(
      'current project embedding configuration',
    );
  });
  it('uses authorized indexed surrounding text without treating the browser selection as verified', async () => {
    const before = embed.mock.calls.length;
    const context = await app.get(ReadingContextService).prepare(owner, {
      bookId: book,
      documentVersion: book,
      selectedText: 'Violet Valley',
      pages: { first: 1, last: 1 },
      action: 'EXPLAIN',
      language: 'en',
    });
    expect(context.bookExcerpts[0]).toMatchObject({
      loadedFrom: 'CLIENT',
      verifiedDocumentText: false,
    });
    expect(context.bookExcerpts[1]).toMatchObject({
      loadedFrom: 'DATABASE',
      verifiedDocumentText: true,
    });
    expect(context.bookExcerpts[1].text).toContain(sections[0]);
    expect(context.limitations).not.toContain('SURROUNDING_TEXT_UNAVAILABLE');
    expect(embed.mock.calls.length).toBe(before);
  });
  it('answers with correct citations, preserves followups, switches chat models without reindexing and abstains without evidence', async () => {
    const conversation = await conversations.create(owner, book);
    const documentsBefore = embed.mock.calls.filter((c) => c[1] === 'document').length;
    for (const [question, modelName, page] of [
      ['What is in Violet Valley?', 'fixture-model-a', 1],
      ['What color are its flowers?', 'fixture-model-b', 1],
      ['What is on Silver Moon?', 'fixture-model-b', 3],
    ] as const) {
      const result = await conversations.ask(
        owner,
        book,
        {
          requestId: randomUUID(),
          conversationId: conversation.id,
          connectionId,
          model: modelName,
          question,
        },
        new AbortController().signal,
        () => {},
      );
      expect(result?.status).toBe('COMPLETED');
      expect(result?.model).toBe(modelName);
      expect(result?.citations[0].source.pages?.first).toBe(page);
      // Check the fixture's claims against the source text, not only citation membership.
      expect(result?.answer).toContain(sections[page - 1]);
      expect(result?.citations[0].excerpt).toContain(sections[page - 1]);
    }
    expect(calls.at(-1)!.userMessages.length).toBeGreaterThan(0);
    expect(embed.mock.calls.filter((c) => c[1] === 'document')).toHaveLength(documentsBefore);
    const fresh = await conversations.create(owner, book),
      before = calls.length;
    const result = await conversations.ask(
      owner,
      book,
      {
        requestId: randomUUID(),
        conversationId: fresh.id,
        connectionId,
        model: 'fixture-model-a',
        question: 'Who won a football match in 2025?',
      },
      new AbortController().signal,
      () => {},
    );
    expect(result?.answer).toMatch(/could not be established/);
    expect(result?.citations).toEqual([]);
    expect(calls).toHaveLength(before);
  });
  it('resumes interrupted workers, reuses completed vectors and bounds transient retries', async () => {
    const id = await upload();
    await indexing.prepare(owner, id);
    const run = await indexing.claim();
    failEmbeddingAfter = 2;
    await indexing.process(run!);
    expect((await indexing.status(owner, id)).status).toBe('QUEUED');
    const existingPages = await db.getRepository(AiPage).countBy({ bookId: id });
    expect(existingPages).toBe(3);
    expect(
      (
        await db.query(
          `SELECT count(*)::int n FROM ai_chunks WHERE "bookId"=$1 AND embedding IS NOT NULL`,
          [id],
        )
      )[0].n,
    ).toBe(1);
    const beforeResume = embed.mock.calls.length;
    await db.query(
      `UPDATE ai_runs SET "availableAt"=now(),status='PROCESSING',"leaseUntil"=now()-interval '1 minute' WHERE id=$1`,
      [run!.id],
    );
    const recovered = await indexing.claim();
    expect(recovered?.id).toBe(run?.id);
    await indexing.process(recovered!);
    expect(embed.mock.calls.length - beforeResume).toBe(2);
    expect((await indexing.status(owner, id)).ready).toBe(true);
    expect(await db.getRepository(AiPage).countBy({ bookId: id })).toBe(3);
    expect(await db.getRepository(AiChunk).countBy({ bookId: id })).toBe(3);
    const before = embed.mock.calls.length;
    await indexing.prepare(owner, id);
    expect(embed).toHaveBeenCalledTimes(before);
  });
  it('discloses missing text and refuses scanned-only books', async () => {
    pageTexts = [sections[0], '', sections[2]];
    const mixed = await upload();
    const status = await prepare(mixed);
    expect(status.ready).toBe(true);
    expect(status.coverage.emptyPages).toEqual([2]);
    expect(status.coverage.limitations?.join(' ')).toMatch(/OCR/);
    pageTexts = ['', '', ''];
    const scanned = await upload();
    const empty = await prepare(scanned);
    expect(empty.status).toBe('FAILED');
    expect(empty.ready).toBe(false);
    expect(empty.failure).toMatch(/OCR/);
    pageTexts = [...sections];
  });
  it('marks partial generation incomplete, requires explicit retry and keeps quota records', async () => {
    const c = await conversations.create(owner, second);
    cancelAfterFirst = true;
    const input = {
      requestId: randomUUID(),
      conversationId: c.id,
      connectionId,
      model: 'fixture-model-a',
      question: 'Explain',
      selection: {
        bookId: second,
        documentVersion: second,
        selectedText: 'Source',
        pages: { first: 1, last: 1 },
        action: 'EXPLAIN' as const,
        language: 'en',
      },
    };
    const result = await conversations.ask(
      owner,
      second,
      input,
      new AbortController().signal,
      () => {},
    );
    expect(result?.status).toBe('INCOMPLETE');
    const before = calls.length;
    await conversations.ask(owner, second, input, new AbortController().signal, () => {});
    expect(calls).toHaveLength(before);
    cancelAfterFirst = false;
    const usage = await db
      .getRepository(AiUsage)
      .findOneByOrFail({ userId: owner, requestId: input.requestId, kind: 'USER_LLM' });
    expect(usage.status).toBe('FAILED');
    expect(usage.reported).toBeNull();
  });
  it('reserves quotas atomically under concurrent calls', async () => {
    const limited = new AssistantConfig(new ConfigService({ AI_DAILY_QUERIES: '1' }));
    const quotas = new QuotaService(db, limited);
    const results = await Promise.allSettled([
      quotas.reserve(other, randomUUID(), 'QUERY_EMBEDDING', 1),
      quotas.reserve(other, randomUUID(), 'QUERY_EMBEDDING', 1),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('cancellation/deletion invalidate leases and cannot resurrect chunks', async () => {
    const id = await upload();
    await indexing.prepare(owner, id);
    const run = await indexing.claim();
    await indexing.cancel(owner, id);
    expect(
      await db
        .getRepository(AiUsage)
        .findOneByOrFail({ userId: owner, requestId: run!.id, kind: 'INDEX_PAGES' }),
    ).toMatchObject({ units: 0, status: 'CANCELLED' });
    await indexing.process(run!);
    expect(await db.getRepository(AiChunk).countBy({ bookId: id })).toBe(0);
    expect((await indexing.status(owner, id)).status).toBe('CANCELLED');
    await indexing.prepare(owner, id);
    const next = await indexing.claim();
    await books.remove(owner, id);
    await indexing.process(next!);
    expect(await db.getRepository(AiRun).countBy({ bookId: id })).toBe(0);
    expect(await db.getRepository(AiChunk).countBy({ bookId: id })).toBe(0);
    const index = await app.get(RetrievalService).ready(owner, book);
    await db.getRepository(Book).update(book, { status: 'DELETING' });
    await expect(
      app.get(RetrievalService).search(owner, book, index.id, [1, 0, 0]),
    ).rejects.toThrow('not ready');
    expect((await db.getRepository(AiIndex).findOneByOrFail({ id: index.id })).active).toBe(false);
  });
});
