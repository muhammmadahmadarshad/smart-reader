import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791801624826 implements MigrationInterface {
  name = 'InitialSchema1791801624826';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(254) NOT NULL, "passwordHash" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_bace6c68efc156fddac9b14bda2" UNIQUE ("tokenHash"), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_57de40bc620f456c7311aa3a1e" ON "sessions" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_50762206f116cd47d1c3fec396" ON "sessions" ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying(64) NOT NULL, "userId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1143abb8c3fad8b06dd857a8c9c" UNIQUE ("tokenHash"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d6a19d4b4f6c62dcd29daa497e" ON "password_reset_tokens" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f75f11ca4ed69b941336c5d0e3" ON "password_reset_tokens" ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "books" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "title" character varying(200) NOT NULL, "objectKey" character varying NOT NULL, "size" integer NOT NULL, "pageCount" integer, "status" character varying(16) NOT NULL DEFAULT 'UPLOADING', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastOpenedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_5a9da7269cff93a01b425b7289c" UNIQUE ("objectKey"), CONSTRAINT "PK_f3f2f25a099d24e12545b70b022" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eaa39a34d811d206617eba205c" ON "books" ("userId", "title") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4e8e96411ff4d7f944ed0217dc" ON "books" ("userId", "lastOpenedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e4efdd17f88e043b42ebeb704" ON "books" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1f325bad718ccc6e698e9d0807" ON "books" ("id", "userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reading_progress" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "bookId" uuid NOT NULL, "page" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_eeb0973f247040264b70e72c08" CHECK ("page" >= 1), CONSTRAINT "PK_2360621825d1001b80d94996cbb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ab73e1dfb9c45436d58f7ee0d2" ON "reading_progress" ("userId", "bookId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "bookmarks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "bookId" uuid NOT NULL, "page" integer NOT NULL, "label" character varying(120) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_42109de6ba7a593c9c4586037b" CHECK ("page" >= 1), CONSTRAINT "PK_7f976ef6cecd37a53bd11685f32" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bd4e812dcf579205dd19e0623f" ON "bookmarks" ("userId", "bookId", "page") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "books" ADD CONSTRAINT "FK_bb8627d137a861e2d5dc8d1eb20" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" ADD CONSTRAINT "FK_852b07cc623a0b04f6d44edf092" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" ADD CONSTRAINT "FK_ab73e1dfb9c45436d58f7ee0d2c" FOREIGN KEY ("bookId", "userId") REFERENCES "books"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookmarks" ADD CONSTRAINT "FK_c6065536f2f6de3a0163e19a584" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookmarks" ADD CONSTRAINT "FK_518a56cf810e81f88d32b0ad49a" FOREIGN KEY ("bookId", "userId") REFERENCES "books"("id","userId") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookmarks" DROP CONSTRAINT "FK_518a56cf810e81f88d32b0ad49a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookmarks" DROP CONSTRAINT "FK_c6065536f2f6de3a0163e19a584"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" DROP CONSTRAINT "FK_ab73e1dfb9c45436d58f7ee0d2c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reading_progress" DROP CONSTRAINT "FK_852b07cc623a0b04f6d44edf092"`,
    );
    await queryRunner.query(`ALTER TABLE "books" DROP CONSTRAINT "FK_bb8627d137a861e2d5dc8d1eb20"`);
    await queryRunner.query(
      `ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "FK_d6a19d4b4f6c62dcd29daa497e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bd4e812dcf579205dd19e0623f"`);
    await queryRunner.query(`DROP TABLE "bookmarks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ab73e1dfb9c45436d58f7ee0d2"`);
    await queryRunner.query(`DROP TABLE "reading_progress"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1f325bad718ccc6e698e9d0807"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2e4efdd17f88e043b42ebeb704"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4e8e96411ff4d7f944ed0217dc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_eaa39a34d811d206617eba205c"`);
    await queryRunner.query(`DROP TABLE "books"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f75f11ca4ed69b941336c5d0e3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d6a19d4b4f6c62dcd29daa497e"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_50762206f116cd47d1c3fec396"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_57de40bc620f456c7311aa3a1e"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
