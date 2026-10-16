import { MigrationInterface, QueryRunner } from 'typeorm';
export class AiOwnershipConstraints1792060000001 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE ai_messages DROP CONSTRAINT "ai_messages_connectionId_fkey"`);
    await q.query(
      `ALTER TABLE ai_messages ADD CONSTRAINT ai_message_connection_owner FOREIGN KEY ("connectionId","userId") REFERENCES ai_connections(id,"userId") ON DELETE SET NULL ("connectionId")`,
    );
    await q.query(
      `CREATE FUNCTION check_ai_vector_dimensions() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.embedding IS NOT NULL AND vector_dims(NEW.embedding) <> (SELECT dimensions FROM ai_indexes WHERE id=NEW."indexId") THEN RAISE EXCEPTION 'Embedding dimensions do not match index'; END IF; RETURN NEW; END $$`,
    );
    await q.query(
      `CREATE TRIGGER ai_vector_dimensions BEFORE INSERT OR UPDATE OF embedding ON ai_chunks FOR EACH ROW EXECUTE FUNCTION check_ai_vector_dimensions()`,
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TRIGGER ai_vector_dimensions ON ai_chunks');
    await q.query('DROP FUNCTION check_ai_vector_dimensions()');
    await q.query('ALTER TABLE ai_messages DROP CONSTRAINT ai_message_connection_owner');
    await q.query(
      `ALTER TABLE ai_messages ADD FOREIGN KEY ("connectionId") REFERENCES ai_connections(id) ON DELETE SET NULL`,
    );
  }
}
