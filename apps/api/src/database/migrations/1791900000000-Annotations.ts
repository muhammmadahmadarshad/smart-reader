import { MigrationInterface, QueryRunner } from 'typeorm';
export class Annotations1791900000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE books ADD COLUMN "pageBoxes" jsonb`);
    await q.query(`CREATE TABLE annotations (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "bookId" uuid NOT NULL, "clientRequestId" uuid NOT NULL, "requestHash" text NOT NULL,
      kind varchar NOT NULL CHECK (kind IN ('HIGHLIGHT','NOTE')), "selectedText" text, "noteText" text, color varchar,
      "documentVersion" uuid, "coordinateVersion" integer, segments jsonb, "firstPage" integer,
      version integer NOT NULL DEFAULT 1 CHECK (version > 0), deleted boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY ("bookId", "userId") REFERENCES books(id,"userId") ON DELETE CASCADE,
      UNIQUE ("userId", "bookId", "clientRequestId"),
      CHECK ("noteText" IS NULL OR length("noteText") BETWEEN 1 AND 5000),
      CHECK ((kind = 'NOTE' AND "noteText" IS NOT NULL AND "selectedText" IS NULL AND color IS NULL AND segments IS NULL AND "documentVersion" IS NULL AND "coordinateVersion" IS NULL AND "firstPage" IS NULL)
        OR (kind = 'HIGHLIGHT' AND "selectedText" IS NOT NULL AND length("selectedText") BETWEEN 1 AND 10000 AND color IS NOT NULL AND color IN ('#F5E6A8','#CFE3C6','#F3D0B5','#ECCBD3') AND "documentVersion" IS NOT NULL AND "documentVersion" = "bookId" AND "coordinateVersion" IS NOT NULL AND "coordinateVersion" IN (1,2) AND segments IS NOT NULL AND jsonb_typeof(segments) = 'array' AND jsonb_array_length(segments) BETWEEN 1 AND 20 AND "firstPage" >= 1))
    )`);
    await q.query(
      `CREATE INDEX annotations_owner_page ON annotations ("userId", "bookId", "firstPage", id) WHERE deleted = false`,
    );
    await q.query(
      `CREATE INDEX annotations_owner_updated ON annotations ("userId", "bookId", "updatedAt", id) WHERE deleted = false`,
    );
    await q.query(
      `CREATE INDEX annotations_segments ON annotations USING gin(segments) WHERE deleted = false`,
    );
    // Preserve old normalized page geometry as schema 1; new writes only accept PDF schema 2.
    await q.query(
      `INSERT INTO annotations (id,"userId","bookId","clientRequestId","requestHash",kind,"selectedText",color,"documentVersion","coordinateVersion",segments,"firstPage","createdAt","updatedAt") SELECT id,"userId","bookId",id,'legacy','HIGHLIGHT',text,'#F5E6A8',"bookId",1,jsonb_build_array(jsonb_build_object('page',page,'rectangles',rectangles)),page,"createdAt","createdAt" FROM highlights`,
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE annotations');
    await q.query('ALTER TABLE books DROP COLUMN "pageBoxes"');
  }
}
