import { MigrationInterface, QueryRunner } from 'typeorm';
export class PurgeDeletedAnnotations1791900000001 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE annotations DROP CONSTRAINT annotations_check`);
    await q.query(`ALTER TABLE annotations ADD CONSTRAINT annotations_shape CHECK (
      (deleted AND "selectedText" IS NULL AND "noteText" IS NULL AND color IS NULL AND segments IS NULL AND "documentVersion" IS NULL AND "coordinateVersion" IS NULL AND "firstPage" IS NULL)
      OR (NOT deleted AND (
        (kind = 'NOTE' AND "noteText" IS NOT NULL AND length(trim("noteText")) > 0 AND "selectedText" IS NULL AND color IS NULL AND segments IS NULL AND "documentVersion" IS NULL AND "coordinateVersion" IS NULL AND "firstPage" IS NULL)
        OR (kind = 'HIGHLIGHT' AND "selectedText" IS NOT NULL AND length(trim("selectedText")) BETWEEN 1 AND 10000 AND color IS NOT NULL AND color IN ('#F5E6A8','#CFE3C6','#F3D0B5','#ECCBD3') AND "documentVersion" IS NOT NULL AND "documentVersion" = "bookId" AND "coordinateVersion" IS NOT NULL AND "coordinateVersion" IN (1,2) AND segments IS NOT NULL AND jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) BETWEEN 1 AND 20 AND "firstPage" IS NOT NULL AND "firstPage" >= 1)
      ))) NOT VALID`);
    await q.query(
      `UPDATE annotations SET "selectedText" = NULL, "noteText" = NULL, color = NULL, segments = NULL, "documentVersion" = NULL, "coordinateVersion" = NULL, "firstPage" = NULL WHERE deleted`,
    );
    await q.query(`ALTER TABLE annotations VALIDATE CONSTRAINT annotations_shape`);
  }
  async down(q: QueryRunner) {
    // Cleared content cannot be recovered; keep retry tombstones valid when rolling back this constraint migration.
    await q.query('ALTER TABLE annotations DROP CONSTRAINT annotations_shape');
    await q.query(
      `ALTER TABLE annotations ADD CONSTRAINT annotations_check CHECK (deleted OR (kind = 'NOTE' AND "noteText" IS NOT NULL) OR (kind = 'HIGHLIGHT' AND "selectedText" IS NOT NULL AND segments IS NOT NULL))`,
    );
  }
}
