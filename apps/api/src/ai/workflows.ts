import type {
  AiErrorState,
  PreparedReadingContext,
  SelectionContextInput,
  SourceReference,
  WorkflowAction,
} from './contracts';
import type { GenerationResult } from './providers';
import type { DocumentIdentity, RetrievalRequest, RetrievalResult } from './rag.contracts';
export const AI_WORKFLOWS = Symbol('AI_WORKFLOWS');
export type WorkflowOptions = {
  requestId: string;
  model: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
};
export type WorkflowStep =
  'validate_access' | 'prepare_context' | 'retrieve' | 'generate' | 'finalize';
export type WorkflowState = {
  requestId: string;
  userId: string;
  authorizedScope: RetrievalRequest['authorizedDocuments'];
  action: WorkflowAction;
  question?: string;
  context?: PreparedReadingContext;
  retrievedPassages: RetrievalResult['passages'];
  sourceReferences: SourceReference[];
  response?: GenerationResult;
  error?: AiErrorState;
  status: 'pending' | 'completed' | 'cancelled' | 'failed';
  steps: WorkflowStep[];
};
/** Internal server API. Not a controller DTO or a client-supplied graph state. */
export interface AiWorkflows {
  selection(
    userId: string,
    input: SelectionContextInput,
    options: WorkflowOptions,
  ): Promise<WorkflowState>;
  bookQa(
    userId: string,
    documents: readonly DocumentIdentity[],
    question: string,
    options: WorkflowOptions,
  ): Promise<WorkflowState>;
}
