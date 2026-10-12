import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHighlights1791807410270 implements MigrationInterface {
  name = 'AddHighlights1791807410270';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "highlights" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "bookId" uuid NOT NULL, "page" integer NOT NULL, "text" text NOT NULL, "rectangles" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_5683e6deb345b9ef86f2936d05" CHECK ("page" >= 1), CONSTRAINT "PK_d1c0c3c4b7c722041ea0c626411" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_54699ee679b9715ae7aa21e389" ON "highlights" ("userId", "bookId", "page") `,
    );
    await queryRunner.query(
      `ALTER TABLE "highlights" ADD CONSTRAINT "FK_e8b7633ae3a0221953057704733" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "highlights" ADD CONSTRAINT "FK_62b8a295b386a3522b73ebda69e" FOREIGN KEY ("bookId", "userId") REFERENCES "books"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "highlights" DROP CONSTRAINT "FK_62b8a295b386a3522b73ebda69e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "highlights" DROP CONSTRAINT "FK_e8b7633ae3a0221953057704733"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_54699ee679b9715ae7aa21e389"`);
    await queryRunner.query(`DROP TABLE "highlights"`);
  }
}
