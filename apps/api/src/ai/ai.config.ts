export const AI_CONFIG = Symbol('AI_CONFIG');
export type AiConfig = {
  enabled: false;
  provider: 'disabled';
  ragEnabled: false;
  selectedChars: number;
  surroundingChars: number;
  questionChars: number;
  noteChars: number;
  totalChars: number;
  chunkChars: number;
  overlapChars: number;
};
export function readAiConfig(env: Record<string, unknown>): AiConfig {
  for (const key of [
    'LANGSMITH_TRACING',
    'LANGCHAIN_TRACING_V2',
    'LANGCHAIN_TRACING',
    'LANGCHAIN_VERBOSE',
  ]) {
    if (env[key] !== undefined && env[key] !== 'false' && env[key] !== false)
      throw new Error(
        `${key} must be false; external tracing of private context is unsupported in Phase 5.`,
      );
  }
  for (const key of ['AI_ENABLED', 'RAG_ENABLED']) {
    const value = env[key] ?? 'false';
    if (value === 'true' || value === true)
      throw new Error(`${key}=true is unsupported in Phase 5; AI and RAG must remain disabled.`);
    if (value !== 'false' && value !== false) throw new Error(`${key} must be false in Phase 5.`);
  }
  if ((env.AI_PROVIDER ?? 'disabled') !== 'disabled')
    throw new Error('AI_PROVIDER must be disabled in Phase 5.');
  const integer = (key: string, fallback: number, min = 1) => {
    const raw = env[key] ?? fallback;
    const value = Number(raw);
    if (
      (typeof raw !== 'string' && typeof raw !== 'number') ||
      String(raw).trim() === '' ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > 1000000
    )
      throw new Error(`${key} must be an integer between ${min} and 1000000.`);
    return value;
  };
  const config: AiConfig = {
    enabled: false,
    provider: 'disabled',
    ragEnabled: false,
    selectedChars: integer('AI_CONTEXT_SELECTION_CHARS', 10000),
    surroundingChars: integer('AI_CONTEXT_SURROUNDING_CHARS', 4000, 0),
    questionChars: integer('AI_CONTEXT_QUESTION_CHARS', 2000),
    noteChars: integer('AI_CONTEXT_NOTE_CHARS', 5000, 0),
    totalChars: integer('AI_CONTEXT_TOTAL_CHARS', 24000),
    chunkChars: integer('RAG_CHUNK_CHARS', 1600, 2),
    overlapChars: integer('RAG_CHUNK_OVERLAP_CHARS', 200, 0),
  };
  if (config.overlapChars >= config.chunkChars)
    throw new Error('RAG_CHUNK_OVERLAP_CHARS must be smaller than RAG_CHUNK_CHARS.');
  return Object.freeze(config);
}
