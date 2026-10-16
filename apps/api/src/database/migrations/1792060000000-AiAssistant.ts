import { MigrationInterface, QueryRunner } from 'typeorm';
export class AiAssistant1792060000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const owned = `id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, "createdAt" timestamptz NOT NULL DEFAULT now()`;
    const book = `"bookId" uuid NOT NULL, FOREIGN KEY ("bookId", "userId") REFERENCES books(id, "userId") ON DELETE CASCADE`;
    await q.query(
      `CREATE TABLE ai_connections (${owned}, name text NOT NULL, provider text NOT NULL, "baseUrl" text NOT NULL, model text NOT NULL, "encryptedKey" text, "keySuffix" text, validation text NOT NULL DEFAULT 'UNVALIDATED', "validatedAt" timestamptz, "validatedModels" jsonb NOT NULL DEFAULT '[]', streaming boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1, UNIQUE(id,"userId"))`,
    );
    await q.query(
      `CREATE TABLE ai_preferences (${owned}, "connectionId" uuid, model text, UNIQUE("userId"), FOREIGN KEY ("connectionId","userId") REFERENCES ai_connections(id,"userId") ON DELETE SET NULL ("connectionId"))`,
    );
    await q.query(
      `CREATE TABLE ai_indexes (${owned}, ${book}, "documentVersion" uuid NOT NULL, "configKey" text NOT NULL, configuration jsonb NOT NULL, dimensions integer NOT NULL CHECK(dimensions > 0), active boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'QUEUED', UNIQUE(id,"userId","bookId"), UNIQUE("userId","bookId","documentVersion","configKey"), CHECK("documentVersion"="bookId"))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX ai_one_active_index ON ai_indexes("userId","bookId") WHERE active`,
    );
    await q.query(
      `CREATE TABLE ai_runs (${owned}, ${book}, "indexId" uuid NOT NULL UNIQUE, status text NOT NULL DEFAULT 'QUEUED', "pagesProcessed" integer NOT NULL DEFAULT 0, "chunksEmbedded" integer NOT NULL DEFAULT 0, "totalChunks" integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0, failure text, coverage jsonb NOT NULL DEFAULT '{}', "leaseToken" uuid, "leaseUntil" timestamptz, "availableAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), FOREIGN KEY ("indexId","userId","bookId") REFERENCES ai_indexes(id,"userId","bookId") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX ai_run_queue ON ai_runs(status,"availableAt","leaseUntil")`);
    await q.query(
      `CREATE TABLE ai_pages (${owned}, ${book}, "indexId" uuid NOT NULL, page integer NOT NULL CHECK(page>0), text text NOT NULL, failed boolean NOT NULL, UNIQUE("indexId",page), FOREIGN KEY ("indexId","userId","bookId") REFERENCES ai_indexes(id,"userId","bookId") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE TABLE ai_chunks (${owned}, ${book}, "indexId" uuid NOT NULL, "documentVersion" uuid NOT NULL, "stableId" text NOT NULL, text text NOT NULL, spans jsonb NOT NULL, tokens integer NOT NULL CHECK(tokens>0), embedding vector, UNIQUE("indexId","stableId"), CHECK("documentVersion"="bookId"), FOREIGN KEY ("indexId","userId","bookId") REFERENCES ai_indexes(id,"userId","bookId") ON DELETE CASCADE)`,
    );
    // Exact filtered cosine search: B-tree narrows the private index before distance ranking.
    await q.query(
      `CREATE INDEX ai_chunks_scope ON ai_chunks("userId","bookId","documentVersion","indexId")`,
    );
    await q.query(
      `CREATE TABLE ai_conversations (${owned}, ${book}, title text NOT NULL, UNIQUE(id,"userId","bookId"))`,
    );
    await q.query(
      `CREATE TABLE ai_messages (${owned}, ${book}, "conversationId" uuid NOT NULL, "requestId" uuid NOT NULL, "requestHash" text NOT NULL, question text NOT NULL, answer text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'PENDING', "connectionId" uuid REFERENCES ai_connections(id) ON DELETE SET NULL, provider text NOT NULL, model text NOT NULL, action text NOT NULL, selection jsonb, citations jsonb NOT NULL DEFAULT '[]', usage jsonb, error text, "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("userId","requestId"), FOREIGN KEY ("conversationId","userId","bookId") REFERENCES ai_conversations(id,"userId","bookId") ON DELETE CASCADE)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX ai_one_pending_message ON ai_messages("userId","conversationId") WHERE status='PENDING'`,
    );
    await q.query(
      `CREATE TABLE ai_usage (${owned}, "requestId" uuid NOT NULL, kind text NOT NULL, status text NOT NULL, units integer NOT NULL CHECK(units>=0), reported jsonb, provider text, model text, "durationMs" integer, "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("userId","requestId",kind))`,
    );
    await q.query(`CREATE INDEX ai_usage_quota ON ai_usage("userId",kind,"createdAt")`);
    // Mark deletion immediately, including when object deletion has to be retried.
    await q.query(
      `CREATE FUNCTION cancel_book_ai() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status <> 'READY' THEN UPDATE ai_indexes SET active=false WHERE "bookId"=NEW.id; UPDATE ai_runs SET status='CANCELLED', "leaseToken"=NULL WHERE "bookId"=NEW.id AND status IN ('QUEUED','PROCESSING'); UPDATE ai_messages SET status='CANCELLED', error='Source book unavailable' WHERE "bookId"=NEW.id AND status='PENDING'; END IF; RETURN NEW; END $$`,
    );
    await q.query(
      `CREATE TRIGGER books_cancel_ai AFTER UPDATE OF status ON books FOR EACH ROW EXECUTE FUNCTION cancel_book_ai()`,
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TRIGGER books_cancel_ai ON books');
    await q.query('DROP FUNCTION cancel_book_ai()');
    for (const name of [
      'ai_usage',
      'ai_messages',
      'ai_conversations',
      'ai_chunks',
      'ai_pages',
      'ai_runs',
      'ai_indexes',
      'ai_preferences',
      'ai_connections',
    ])
      await q.query(`DROP TABLE ${name}`);
  }
}
