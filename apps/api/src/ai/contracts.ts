/** Transport-safe contracts. No runtime dependencies; shared with the web app via type exports. */
export type AiAction = 'EXPLAIN' | 'GIVE_EXAMPLE' | 'TRANSLATE' | 'ASK_FOLLOWUP';
export type WorkflowAction = AiAction | 'ASK_BOOK';
export type SelectionSegment = {
  /** One-based PDF page. Coordinate version 2: unrotated PDF user space, bottom-left origin. */
  page: number;
  rectangles: { x: number; y: number; width: number; height: number }[];
};
export type SourceReference = {
  sourceType: 'BOOK_TEXT' | 'PERSONAL_NOTE' | 'AI_GENERATED';
  bookId?: string;
  /** Immutable upload UUID; null for a note with no document anchor. */
  documentVersion: string | null;
  sourceTitle: string;
  pages?: { first: number; last: number };
  annotationId?: string;
  notebookEntryId?: string;
  selection?: { coordinateVersion: 2; segments: SelectionSegment[] };
  chunkId?: string;
};
export type CitationNavigation =
  | {
      state: 'available';
      bookId: string;
      documentVersion: string;
      page: number;
      annotationId?: string;
    }
  | {
      state: 'unavailable';
      reason: 'SOURCE_MISSING' | 'SOURCE_UNAUTHORIZED' | 'VERSION_MISMATCH' | 'NO_PAGE';
    };
/** No user identity in client input. Trusted server code supplies identity separately. */
export type SelectionContextInput = {
  bookId: string;
  documentVersion: string;
  selectedText: string;
  pages: { first: number; last: number };
  anchors?: {
    bookId: string;
    documentVersion: string;
    coordinateVersion: 2;
    segments: SelectionSegment[];
  };
  annotationId?: string;
  notebookEntryId?: string;
  question?: string;
  action: AiAction;
  language: string;
};
export type ContextPassage = {
  text: string;
  source: SourceReference;
  loadedFrom: 'CLIENT' | 'DATABASE';
  provenance: 'BROWSER_SELECTION' | 'USER_AUTHORED' | 'EXTRACTED_DOCUMENT';
  verifiedDocumentText: boolean;
  trust: 'UNTRUSTED_CONTENT';
};
export type PreparedReadingContext = {
  applicationInstructions: string;
  userQuestion?: { text: string; trust: 'UNTRUSTED_CONTENT' };
  bookExcerpts: ContextPassage[];
  personalNotes: ContextPassage[];
  /** Reserved boundary; Phase 5 does not load conversation history. */
  conversationHistory: [];
  action: WorkflowAction;
  language: string;
  limitations: (
    | 'SURROUNDING_TEXT_UNAVAILABLE'
    | 'SURROUNDING_TEXT_TRUNCATED'
    | 'PERSONAL_NOTE_TRUNCATED'
    | 'GEOMETRY_UNAVAILABLE'
  )[];
  /** UTF-16 code units, including instructions/question/notes, excluding source metadata. Not tokens. */
  textLength: number;
};
export type AiErrorCode =
  | 'AI_DISABLED'
  | 'RAG_DISABLED'
  | 'INVALID_CONTEXT'
  | 'CONTEXT_LIMIT_EXCEEDED'
  | 'SOURCE_MISMATCH'
  | 'NOTEBOOKS_UNAVAILABLE'
  | 'INVALID_SCOPE'
  | 'CANCELLED'
  | 'PROVIDER_FAILED';
export type AiErrorState = { code: AiErrorCode; message: string; retryable: boolean };
export type ProviderUsage = { inputTokens?: number; outputTokens?: number };
export type CompletionStatus = 'completed' | 'cancelled' | 'failed';
/** started once, then zero or more deltas, then exactly one terminal event. No events after terminal.
 * Preflight failure may emit only failed (no provider request was started). */
export type GenerationEvent =
  | { type: 'started'; requestId: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'completed';
      provider?: string;
      model?: string;
      content: string;
      finishReason: 'stop' | 'output_limit';
      usage?: ProviderUsage;
    }
  | { type: 'cancelled'; partialContent?: string; usage?: ProviderUsage }
  | { type: 'failed'; error: AiErrorState; usage?: ProviderUsage };
export type AiCapabilities = {
  generation: boolean;
  streaming: boolean;
  embeddings: boolean;
  retrieval: boolean;
  connectionsEnabled?: boolean;
  reason: string | null;
};
export type UsageMetadata = {
  requestId: string;
  userId: string;
  action: WorkflowAction;
  provider: string;
  model: string;
  usage?: ProviderUsage;
  durationMs: number;
  status: CompletionStatus;
  errorCode?: AiErrorCode;
};
