import 'reflect-metadata';
import { Module, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import http from 'node:http';
import https from 'node:https';
import { AiModule } from '../src/ai/ai.module';
import { BooksModule } from '../src/books/books.module';
import { BooksService } from '../src/books/books.service';
import { AnnotationsModule } from '../src/annotations/annotations.module';
import { AnnotationsService } from '../src/annotations/annotations.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { ReadingContextService } from '../src/ai/reading-context.service';
import { AI_WORKFLOWS, AiWorkflows, WorkflowOptions } from '../src/ai/workflows';
import { LangGraphWorkflows } from '../src/ai/langgraph.workflows';
import { DisabledGeneration, DisabledRetrieval } from '../src/ai/disabled.providers';
import { readAiConfig } from '../src/ai/ai.config';
import type { SelectionContextInput } from '../src/ai/contracts';
import type { TextGenerator, PassageRetriever } from '../src/ai/providers';
import type { RetrievalResult } from '../src/ai/rag.contracts';

const books = {
  owned: jest.fn(async (owner: string, id: string) => {
    if (owner !== 'owner' || id !== 'book') throw new NotFoundException();
    return {
      id,
      userId: owner,
      title: 'Server title',
      pageCount: 2,
      pageBoxes: [[0, 0, 600, 800]],
    };
  }),
};
const annotations = { get: jest.fn() };
@Module({ providers: [{ provide: BooksService, useValue: books }], exports: [BooksService] })
class OfflineBooks {}
@Module({
  providers: [{ provide: AnnotationsService, useValue: annotations }],
  exports: [AnnotationsService],
})
class OfflineAnnotations {}
@Module({
  providers: [{ provide: AuthGuard, useValue: { canActivate: () => false } }],
  exports: [AuthGuard],
})
class OfflineAuth {}
const input: SelectionContextInput = {
  bookId: 'book',
  documentVersion: 'book',
  selectedText: 'Private selection',
  pages: { first: 1, last: 1 },
  action: 'EXPLAIN',
  language: 'ur',
};
const options: WorkflowOptions = {
  requestId: 'test-request',
  model: 'test-only',
  maxOutputTokens: 100,
};
const documents = [{ bookId: 'book', documentVersion: 'book' }];
const config = readAiConfig({});
const result: RetrievalResult = {
  passages: [
    {
      ownerId: 'owner',
      passage: {
        text: 'Authorized extracted source.',
        source: {
          sourceType: 'BOOK_TEXT',
          bookId: 'book',
          documentVersion: 'book',
          sourceTitle: 'Ignored adapter title',
          pages: { first: 1, last: 1 },
          chunkId: 'chunk',
        },
        provenance: 'EXTRACTED_DOCUMENT',
        loadedFrom: 'DATABASE',
        verifiedDocumentText: true,
        trust: 'UNTRUSTED_CONTENT',
      },
      index: {
        ...documents[0],
        extractionVersion: 'v1',
        chunkingVersion: 'v1',
        indexVersion: 'index-v1',
        embedding: { provider: 'test-only', model: 'fixture', dimensions: 3 },
        chunking: { chunkChars: 100, overlapChars: 10 },
      },
    },
  ],
};
function workflow(
  generator: TextGenerator = new DisabledGeneration(),
  retriever: PassageRetriever = new DisabledRetrieval(),
  limits = config,
) {
  return new LangGraphWorkflows(
    books as unknown as BooksService,
    new ReadingContextService(
      books as unknown as BooksService,
      annotations as unknown as AnnotationsService,
      limits,
    ),
    generator,
    retriever,
    limits,
  );
}
describe('Internal LangGraph workflows with networking forbidden', () => {
  let network: jest.SpyInstance[];
  beforeEach(() => {
    books.owned.mockClear();
    network = [
      jest.spyOn(globalThis, 'fetch'),
      jest.spyOn(http, 'request'),
      jest.spyOn(http, 'get'),
      jest.spyOn(https, 'request'),
      jest.spyOn(https, 'get'),
    ];
    for (const spy of network)
      spy.mockImplementation(() => {
        throw new Error('External networking forbidden');
      });
  });
  afterEach(() => {
    try {
      for (const spy of network) expect(spy).not.toHaveBeenCalled();
    } finally {
      network.forEach((spy) => spy.mockRestore());
    }
  });
  it('retains disabled adapter behavior for offline foundation consumers', async () => {
    expect(books.owned).not.toHaveBeenCalled();
    const context = await new ReadingContextService(
      books as unknown as BooksService,
      annotations as unknown as AnnotationsService,
      config,
    ).prepare('owner', input);
    expect(context.bookExcerpts[0].verifiedDocumentText).toBe(false);
    const service = workflow();
    const selection = await service.selection('owner', input, options);
    expect(selection.steps).toEqual(['validate_access', 'prepare_context', 'generate', 'finalize']);
    expect(selection).toMatchObject({ status: 'failed', error: { code: 'AI_DISABLED' } });
    const qa = await service.bookQa('owner', documents, 'Question?', options);
    expect(qa.steps).toEqual(['validate_access', 'retrieve', 'finalize']);
    expect(qa).toMatchObject({ status: 'failed', error: { code: 'RAG_DISABLED' } });
    expect(qa.response).toBeUndefined();
  });
  it('runs selection and Q&A transitions with test-only adapters and propagates cancellation signals', async () => {
    const generate = jest
      .fn<ReturnType<TextGenerator['generate']>, Parameters<TextGenerator['generate']>>()
      .mockResolvedValue({
        status: 'completed',
        content: 'Test fixture answer',
        finishReason: 'stop',
      });
    const retrieve = jest
      .fn<ReturnType<PassageRetriever['retrieve']>, Parameters<PassageRetriever['retrieve']>>()
      .mockResolvedValue(result);
    const service = workflow({ generate }, { retrieve });
    const controller = new AbortController();
    const selection = await service.selection('owner', input, {
      ...options,
      signal: controller.signal,
    });
    expect(selection.status).toBe('completed');
    expect(generate.mock.calls[0][0].signal).toBe(controller.signal);
    const qa = await service.bookQa('owner', documents, 'Question?', options);
    expect(qa.steps).toEqual([
      'validate_access',
      'retrieve',
      'prepare_context',
      'generate',
      'finalize',
    ]);
    expect(qa.authorizedScope).toEqual(documents);
    expect(qa.sourceReferences[0].sourceTitle).toBe('Server title');
    expect(qa.response?.usage).toBeUndefined();
    expect(retrieve.mock.calls[0][0]).toMatchObject({
      owner: { userId: 'owner' },
      authorizedDocuments: documents,
    });
    controller.abort();
    await expect(
      service.selection('owner', input, { ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('authorizes before starting, rejects empty scope and blocks attempts to broaden retrieval scope', async () => {
    const generate = jest.fn();
    const retrieve = jest.fn().mockResolvedValue({
      passages: [
        {
          ...result.passages[0],
          passage: {
            ...result.passages[0].passage,
            source: { ...result.passages[0].passage.source, bookId: 'foreign' },
          },
        },
      ],
    });
    const service = workflow({ generate }, { retrieve });
    await expect(service.bookQa('owner', [], 'Question?', options)).rejects.toMatchObject({
      code: 'INVALID_SCOPE',
    });
    await expect(service.selection('other', input, options)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    const qa = await service.bookQa('owner', documents, 'Question?', options);
    expect(qa.error?.code).toBe('INVALID_SCOPE');
    expect(generate).not.toHaveBeenCalled();
    expect(qa.steps).toEqual(['validate_access', 'retrieve', 'finalize']);
  });
  it('records optional passage truncation and total context limits', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue({ status: 'completed', content: 'test-only', finishReason: 'stop' });
    const service = workflow(
      { generate },
      { retrieve: async () => result },
      { ...config, surroundingChars: 5 },
    );
    const qa = await service.bookQa('owner', documents, 'Question?', options);
    expect(qa.context?.bookExcerpts[0].text).toBe('Autho');
    expect(qa.context?.limitations).toEqual(['SURROUNDING_TEXT_TRUNCATED']);
    expect(qa.context!.textLength).toBeLessThanOrEqual(config.totalChars);
  });
  it('does not run generation after a context validation failure and never exposes provider exception text', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('secret private passage'));
    const service = workflow({ generate });
    const invalid = await service.selection(
      'owner',
      { ...input, selectedText: 'x'.repeat(10001) },
      options,
    );
    expect(invalid.error?.code).toBe('CONTEXT_LIMIT_EXCEEDED');
    expect(generate).not.toHaveBeenCalled();
    const failed = await service.selection('owner', input, options);
    expect(failed.error).toEqual({
      code: 'PROVIDER_FAILED',
      message: 'Workflow could not complete.',
      retryable: false,
    });
  });
  it('blocks external tracing even if enabled after application startup', async () => {
    const before = process.env.LANGSMITH_TRACING;
    try {
      process.env.LANGSMITH_TRACING = 'true';
      await expect(workflow().selection('owner', input, options)).rejects.toThrow(
        /external tracing/,
      );
      expect(books.owned).not.toHaveBeenCalled();
    } finally {
      if (before === undefined) delete process.env.LANGSMITH_TRACING;
      else process.env.LANGSMITH_TRACING = before;
    }
  });
});
