import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePgvector1791980000000 implements MigrationInterface {
  name = 'EnablePgvector1791980000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Preinstalled extension also permits migrations under a non-superuser application role.
    const installed = await queryRunner.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
    );
    if (installed.length) return;
    try {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch {
      // Fail the migration transaction rather than record a successful but incomplete setup.
      throw new Error(
        'pgvector setup failed. An administrator must install pgvector for PostgreSQL 17 and run CREATE EXTENSION IF NOT EXISTS vector in the application database, then rerun migrations. No application data has been changed.',
      );
    }
  }
  async down(): Promise<void> {
    // Shared database capability: deliberately retain it on rollback. Never DROP ... CASCADE.
  }
}
