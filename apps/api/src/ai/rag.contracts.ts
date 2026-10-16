import type { ContextPassage } from './contracts';
export type DocumentIdentity = { bookId: string; documentVersion: string };
export type ProcessingVersions = { extractionVersion: string; chunkingVersion: string };
export type ExtractedPageText = { page: number; text: string };
/** Character sizes and offsets use UTF-16 code units, never token estimates. */
export type ChunkingConfig = { chunkChars: number; overlapChars: number };
export type SourceSpan = { page: number; start: number; end: number };
export type DocumentChunk = DocumentIdentity &
  ProcessingVersions & {
    id: string;
    text: string;
    spans: SourceSpan[];
    config: ChunkingConfig;
  };
export type EmbeddingIdentity = { provider: string; model: string; dimensions: number };
export type IndexIdentity = DocumentIdentity &
  ProcessingVersions & {
    indexVersion: string;
    embedding: EmbeddingIdentity;
    chunking: ChunkingConfig;
  };
export type ProcessingStatus =
  | 'PENDING'
  | 'EXTRACTING'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'
  | 'STALE';
export type ProcessingFailure = {
  stage: 'extraction' | 'chunking' | 'embedding' | 'indexing';
  code: string;
  safeMessage: string;
  retryable: boolean;
};
/** Server-created scope only. Never bind this interface directly to a request body.
 * Authorize each document via BooksService.owned before invoking a retriever and recheck before use. */
export type RetrievalRequest = {
  owner: { userId: string };
  authorizedDocuments: readonly [DocumentIdentity, ...DocumentIdentity[]];
  query: string;
  limit: number;
  signal?: AbortSignal;
};
/** Only complete READY indexes matching every requested version may contribute results. */
export type RetrievalResult = {
  passages: { ownerId: string; passage: ContextPassage; index: IndexIdentity; score?: number }[];
};
/** Future storage boundary: no implementation, vector columns or fixed dimensions in Phase 5. */
export type VectorRecord = DocumentIdentity & {
  ownerId: string;
  chunkId: string;
  embedding: EmbeddingIdentity;
  indexVersion: string;
  vector: readonly number[];
};
export interface VectorStorage {
  store(records: readonly VectorRecord[], signal?: AbortSignal): Promise<void>;
  /** SQL must filter owner, book, document version and READY index before similarity ranking. */
  search(
    request: RetrievalRequest & {
      embedding: EmbeddingIdentity;
      vector: readonly number[];
      indexVersion: string;
    },
  ): Promise<RetrievalResult>;
}
