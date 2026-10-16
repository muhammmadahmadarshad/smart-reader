import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiDeletionQuota1792060000002 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE OR REPLACE FUNCTION cancel_book_ai() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status <> 'READY' THEN
        UPDATE ai_indexes SET active=false WHERE "bookId"=NEW.id;
        UPDATE ai_usage u SET status='CANCELLED',units=LEAST(u.units,r."pagesProcessed"),"updatedAt"=now() FROM ai_runs r WHERE u."requestId"=r.id AND u."userId"=r."userId" AND u.kind='INDEX_PAGES' AND r."bookId"=NEW.id AND r.status IN ('QUEUED','PROCESSING');
        UPDATE ai_runs SET status='CANCELLED',"leaseToken"=NULL WHERE "bookId"=NEW.id AND status IN ('QUEUED','PROCESSING');
        UPDATE ai_messages SET status='CANCELLED',error='Source book unavailable' WHERE "bookId"=NEW.id AND status='PENDING';
      END IF; RETURN NEW; END $$`);
  }
  async down(q: QueryRunner) {
    await q.query(
      `CREATE OR REPLACE FUNCTION cancel_book_ai() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status <> 'READY' THEN UPDATE ai_indexes SET active=false WHERE "bookId"=NEW.id; UPDATE ai_runs SET status='CANCELLED', "leaseToken"=NULL WHERE "bookId"=NEW.id AND status IN ('QUEUED','PROCESSING'); UPDATE ai_messages SET status='CANCELLED', error='Source book unavailable' WHERE "bookId"=NEW.id AND status='PENDING'; END IF; RETURN NEW; END $$`,
    );
  }
}
