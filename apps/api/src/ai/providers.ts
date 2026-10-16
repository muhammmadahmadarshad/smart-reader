import type { GenerationEvent, PreparedReadingContext, ProviderUsage } from './contracts';
import type { EmbeddingIdentity, RetrievalRequest, RetrievalResult } from './rag.contracts';
export const TEXT_GENERATOR = Symbol('TEXT_GENERATOR');
export const TEXT_STREAMER = Symbol('TEXT_STREAMER');
export const EMBEDDER = Symbol('EMBEDDER');
export const PASSAGE_RETRIEVER = Symbol('PASSAGE_RETRIEVER');
export type GenerationRequest = {
  connection?: { userId: string; connectionId: string };
  requestId: string;
  model: string;
  applicationInstructions: string;
  userMessages: readonly { role: 'user' | 'assistant'; content: string }[];
  sourceContext: PreparedReadingContext;
  maxOutputTokens: number;
  signal?: AbortSignal;
};
export type GenerationResult =
  | {
      status: 'completed';
      content: string;
      finishReason: 'stop' | 'output_limit';
      usage?: ProviderUsage;
    }
  | { status: 'cancelled'; content: string; usage?: ProviderUsage };
/** Failure rejects with AiError. Cancellation resolves cancelled; usage remains absent if unknown. */
export interface TextGenerator {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
export interface TextStreamer {
  stream(request: GenerationRequest): AsyncIterable<GenerationEvent>;
}
export interface Embedder {
  embed(request: {
    texts: readonly string[];
    model: string;
    signal?: AbortSignal;
  }): Promise<{ identity: EmbeddingIdentity; vectors: number[][]; usage?: ProviderUsage }>;
}
export interface PassageRetriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}
