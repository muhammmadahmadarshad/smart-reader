import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
@Injectable()
export class AssistantConfig {
  constructor(private readonly config: ConfigService) {
    this.validate();
  }
  get(name: string, fallback = ''): string {
    return String(this.config.get(name, fallback));
  }
  int(name: string, fallback: number, min = 1, max = 10000000) {
    const value = Number(this.get(name, String(fallback)));
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${name} must be an integer from ${min} to ${max}.`);
    return value;
  }
  get enabled() {
    return this.get('AI_ENABLED', 'true') === 'true' && this.get('AI_PROVIDER', 'user') === 'user';
  }
  get keys(): Record<string, string> {
    try {
      const keys: unknown = JSON.parse(this.get('AI_ENCRYPTION_KEYS', '{}'));
      if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error();
      return keys as Record<string, string>;
    } catch {
      throw new Error('AI_ENCRYPTION_KEYS must be a JSON object of key versions to base64 keys.');
    }
  }
  get keyVersion() {
    return this.get('AI_ENCRYPTION_KEY_VERSION', 'v1');
  }
  get connectionsEnabled() {
    return this.enabled && !!this.keys[this.keyVersion];
  }
  get embeddingReady() {
    return (
      this.enabled &&
      this.get('RAG_ENABLED', 'true') === 'true' &&
      !!this.get('PROJECT_EMBEDDING_API_KEY')
    );
  }
  get embedding() {
    return {
      provider: 'openai',
      model: this.get('PROJECT_EMBEDDING_MODEL', 'text-embedding-3-small'),
      dimensions: this.int('PROJECT_EMBEDDING_DIMENSIONS', 1536, 1, 1536),
      version: this.get('PROJECT_EMBEDDING_VERSION', 'openai-small-v1'),
      endpoint: 'https://api.openai.com/v1',
      extractionVersion: 'pdfjs-5.4.296-lines-v1',
      chunkingVersion: 'cl100k-paragraph-v1',
      tokens: this.int('RAG_CHUNK_TOKENS', 600, 32, 8000),
      overlap: this.int('RAG_OVERLAP_TOKENS', 80, 0, 7999),
    };
  }
  get embeddingKey() {
    return createHash('sha256').update(JSON.stringify(this.embedding)).digest('hex');
  }
  get timeout() {
    return this.int('AI_TIMEOUT_MS', 60000, 1000, 180000);
  }
  get batchSize() {
    return this.int('EMBEDDING_BATCH_SIZE', 16, 1, 64);
  }
  get workers() {
    return this.int('INDEX_CONCURRENCY', 1, 1, 4);
  }
  get maxPages() {
    return this.int('INDEX_MAX_PAGES', 2000, 1, 10000);
  }
  get maxTextBytes() {
    return this.int('INDEX_MAX_EXTRACTED_BYTES', 10000000);
  }
  get maxChunks() {
    return this.int('INDEX_MAX_CHUNKS', 30000, 1, 100000);
  }
  get maxFileBytes() {
    return this.int('INDEX_MAX_MB', 50, 1, 500) * 1048576;
  }
  get outputTokens() {
    return this.int('AI_MAX_OUTPUT_TOKENS', 2048, 32, 8192);
  }
  get inputBytes() {
    return this.int('AI_MAX_INPUT_BYTES', 24000, 1000, 100000);
  }
  get minScore() {
    const value = Number(this.get('RAG_MIN_SCORE', '0.25'));
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new Error('RAG_MIN_SCORE must be 0..1');
    return value;
  }
  validate() {
    if (!['user', 'disabled'].includes(this.get('AI_PROVIDER', 'user')))
      throw new Error('AI_PROVIDER must be user or disabled.');
    if (
      !/^[a-zA-Z0-9_-]{1,32}$/.test(this.keyVersion) ||
      Object.keys(this.keys).some((k) => !/^[a-zA-Z0-9_-]{1,32}$/.test(k))
    )
      throw new Error(
        'AI encryption key version identifiers must contain 1-32 letters, numbers, underscores or hyphens.',
      );
    if (Object.keys(this.keys).length && !this.keys[this.keyVersion])
      throw new Error('AI_ENCRYPTION_KEY_VERSION must identify a configured encryption key.');
    for (const name of ['AI_ENABLED', 'RAG_ENABLED'])
      if (!['true', 'false'].includes(this.get(name, 'true')))
        throw new Error(`${name} must be true or false.`);
    for (const name of [
      'LANGSMITH_TRACING',
      'LANGCHAIN_TRACING_V2',
      'LANGCHAIN_TRACING',
      'LANGCHAIN_VERBOSE',
    ])
      if (!['', 'false'].includes(this.get(name)))
        throw new Error('External AI tracing and verbose logging must remain disabled.');
    for (const value of Object.values(this.keys))
      if (
        typeof value !== 'string' ||
        !/^[A-Za-z0-9+/]{43}=$/.test(value) ||
        Buffer.from(value, 'base64').length !== 32
      )
        throw new Error('AI_ENCRYPTION_KEYS must contain base64-encoded 32-byte keys.');
    if (
      this.get('PROJECT_EMBEDDING_PROVIDER', 'openai') !== 'openai' ||
      this.embedding.model !== 'text-embedding-3-small'
    )
      throw new Error(
        'This deployment supports project OpenAI text-embedding-3-small embeddings only.',
      );
    if (this.embedding.overlap >= this.embedding.tokens)
      throw new Error('RAG_OVERLAP_TOKENS must be smaller than RAG_CHUNK_TOKENS.');
    void [
      this.timeout,
      this.batchSize,
      this.workers,
      this.maxPages,
      this.maxTextBytes,
      this.maxChunks,
      this.maxFileBytes,
      this.outputTokens,
      this.inputBytes,
      this.minScore,
      this.int('AI_DAILY_INDEX_PAGES', 2000),
      this.int('AI_DAILY_EMBEDDING_TOKENS', 2000000),
      this.int('AI_DAILY_QUERIES', 100),
      this.int('AI_DAILY_LLM_REQUESTS', 100),
    ];
    for (const origin of this.get('AI_ALLOWED_PRIVATE_ORIGINS').split(',').filter(Boolean))
      if (new URL(origin).origin !== origin)
        throw new Error('AI_ALLOWED_PRIVATE_ORIGINS requires exact origins without paths.');
  }
}
