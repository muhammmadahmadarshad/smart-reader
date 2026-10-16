import { Injectable, HttpException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AiUsage } from './entities/ai.entities';
import { AssistantConfig } from './assistant.config';
import type { ProviderUsage } from './contracts';
@Injectable()
export class QuotaService {
  constructor(
    private readonly db: DataSource,
    private readonly config: AssistantConfig,
  ) {}
  async reserve(
    userId: string,
    requestId: string,
    kind: AiUsage['kind'],
    units: number,
    manager?: EntityManager,
  ): Promise<AiUsage> {
    const work = async (m: EntityManager) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ai-quota:${userId}`]);
      const repo = m.getRepository(AiUsage),
        existing = await repo.findOneBy({ userId, requestId, kind });
      if (existing && (kind !== 'INDEX_PAGES' || existing.status === 'RESERVED')) return existing;
      const limits = {
        INDEX_PAGES: ['AI_DAILY_INDEX_PAGES', 2000],
        DOCUMENT_EMBEDDING: ['AI_DAILY_EMBEDDING_TOKENS', 2000000],
        QUERY_EMBEDDING: ['AI_DAILY_QUERIES', 100],
        USER_LLM: ['AI_DAILY_LLM_REQUESTS', 100],
      } as const;
      const [name, fallback] = limits[kind];
      const [sum] = await m.query(
        `SELECT COALESCE(sum(units),0)::int total FROM ai_usage WHERE "userId"=$1 AND kind=$2 AND "createdAt">=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
        [userId, kind],
      );
      const reservedToday =
        existing &&
        existing.createdAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
          ? existing.units
          : 0;
      if (sum.total + units - reservedToday > this.config.int(name, fallback))
        throw new HttpException(
          'Daily AI processing quota reached. Try again after the quota resets.',
          429,
        );
      if (kind === 'USER_LLM') {
        const [active] = await m.query(
          `SELECT count(*) FILTER (WHERE status IN ('RESERVED','STARTED'))::int concurrent, count(*) FILTER (WHERE "createdAt">now()-interval '1 minute')::int recent FROM ai_usage WHERE "userId"=$1 AND kind='USER_LLM' AND "updatedAt">now()-interval '5 minutes'`,
          [userId],
        );
        if (active.concurrent >= 2 || active.recent >= 10)
          throw new HttpException('AI request concurrency or rate limit reached.', 429);
      }
      return repo.save(
        repo.create({
          ...(existing ?? {}),
          userId,
          requestId,
          kind,
          units,
          status: 'RESERVED',
          createdAt: new Date(),
        }),
      );
    };
    return manager ? work(manager) : this.db.transaction(work);
  }
  async start(id: string, provider: string, model: string) {
    await this.db.getRepository(AiUsage).update(id, { status: 'STARTED', provider, model });
  }
  async finish(
    id: string,
    status: AiUsage['status'],
    reported?: ProviderUsage,
    durationMs?: number,
    units?: number,
  ) {
    await this.db.getRepository(AiUsage).update(id, {
      status,
      reported: reported ?? null,
      durationMs: durationMs ?? null,
      ...(units === undefined ? {} : { units }),
    });
  }
}
