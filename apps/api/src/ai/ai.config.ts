export const AI_CONFIG = Symbol('AI_CONFIG');
export type AiConfig = {
  enabled: boolean;
  provider: 'disabled' | 'user';
  ragEnabled: boolean;
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
      throw new Error(`${key} must be false; external tracing of private context is unsupported.`);
  }
  for (const key of ['AI_ENABLED', 'RAG_ENABLED']) {
    const value = env[key] ?? 'false';
    if (!['true', 'false', true, false].includes(value as string))
      throw new Error(`${key} must be true or false.`);
  }
  if (!['disabled', 'user'].includes(String(env.AI_PROVIDER ?? 'user')))
    throw new Error('AI_PROVIDER must be user or disabled; no project LLM fallback is supported.');
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
    enabled: env.AI_ENABLED === 'true' || env.AI_ENABLED === true,
    provider: env.AI_PROVIDER === 'disabled' ? 'disabled' : 'user',
    ragEnabled: env.RAG_ENABLED === 'true' || env.RAG_ENABLED === true,
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
