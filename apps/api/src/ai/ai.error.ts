import type { AiErrorCode, AiErrorState } from './contracts';
export class AiError extends Error implements AiErrorState {
  readonly retryable = false;
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
