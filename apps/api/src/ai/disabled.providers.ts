import { Injectable } from '@nestjs/common';
import { AiError } from './ai.error';
import type { GenerationEvent } from './contracts';
import type {
  Embedder,
  GenerationRequest,
  GenerationResult,
  PassageRetriever,
  TextGenerator,
  TextStreamer,
} from './providers';
import type { RetrievalRequest, RetrievalResult } from './rag.contracts';
@Injectable()
export class DisabledGeneration implements TextGenerator, TextStreamer {
  async generate(_request: GenerationRequest): Promise<GenerationResult> {
    throw new AiError('AI_DISABLED', 'Text generation is unavailable in Phase 5.');
  }
  async *stream(_request: GenerationRequest): AsyncIterable<GenerationEvent> {
    yield {
      type: 'failed',
      error: {
        code: 'AI_DISABLED',
        message: 'Text generation is unavailable in Phase 5.',
        retryable: false,
      },
    };
  }
}
@Injectable()
export class DisabledEmbeddings implements Embedder {
  async embed(_request: Parameters<Embedder['embed']>[0]): ReturnType<Embedder['embed']> {
    throw new AiError('RAG_DISABLED', 'Embeddings are unavailable in Phase 5.');
  }
}
@Injectable()
export class DisabledRetrieval implements PassageRetriever {
  async retrieve(_request: RetrievalRequest): Promise<RetrievalResult> {
    throw new AiError('RAG_DISABLED', 'Retrieval is unavailable in Phase 5.');
  }
}
