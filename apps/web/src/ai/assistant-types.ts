import type { SourceReference, SelectionContextInput } from './types';
export type Connection = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  keySuffix: string | null;
  validation: string;
  validatedAt: string | null;
  validatedModels: string[];
  streaming: boolean;
};
export type Capability = {
  generation: boolean;
  streaming: boolean;
  embeddings: boolean;
  retrieval: boolean;
  connectionsEnabled: boolean;
  reason: string | null;
};
export type IndexInfo = {
  status: string;
  ready: boolean;
  available: boolean;
  reason: string | null;
  totalPages: number;
  pagesProcessed: number;
  chunksEmbedded: number;
  totalChunks: number;
  failure: string | null;
  coverage: {
    textPages?: number[];
    emptyPages?: number[];
    failedPages?: number[];
    limitations?: string[];
  };
};
export type Conversation = { id: string; title: string };
export type AssistantMessage = {
  id: string;
  requestId: string;
  question: string;
  answer: string;
  status: string;
  provider: string;
  model: string;
  createdAt: string;
  error: string | null;
  selection: SelectionContextInput | null;
  citations: { id: string; source: SourceReference; excerpt: string }[];
};
