import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { BooksService } from '../books/books.service';
import { StorageService } from '../storage/storage.service';
import { AiChunk, AiIndex, AiPage, AiRun } from './entities/ai.entities';
import { AssistantConfig } from './assistant.config';
import { PROJECT_EMBEDDER, ProjectEmbedder, ProviderFailure } from './project-embeddings';
import { QuotaService } from './quota.service';
import { tokenChunks } from './token-chunks';
import { PDF_EXTRACTOR, PdfExtractor } from './pdf-extractor';
export { PDF_EXTRACTOR, PdfTextExtractor } from './pdf-extractor';
@Injectable()
export class IndexingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopping = false;
  private controllers = new Set<AbortController>();
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
    private readonly storage: StorageService,
    private readonly config: AssistantConfig,
    private readonly quotas: QuotaService,
    @Inject(PROJECT_EMBEDDER) private readonly embeddings: ProjectEmbedder,
    @Inject(PDF_EXTRACTOR) private readonly extractor: PdfExtractor,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick().catch(() => undefined), 3000);
    this.timer.unref();
  }
  onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
  }
  async status(userId: string, bookId: string) {
    const book = await this.books.owned(userId, bookId, true);
    const index = await this.db
      .getRepository(AiIndex)
      .findOneBy({ userId, bookId, documentVersion: book.id, configKey: this.config.embeddingKey });
    const run = index
      ? await this.db.getRepository(AiRun).findOneBy({ userId, indexId: index.id })
      : null;
    return {
      status: run?.status ?? 'NOT_PREPARED',
      ready: !!index?.active && index.status === 'READY' && this.config.embeddingReady,
      available: this.config.embeddingReady,
      reason: this.config.embeddingReady ? null : 'Project embedding service is not configured.',
      totalPages: book.pageCount,
      pagesProcessed: run?.pagesProcessed ?? 0,
      chunksEmbedded: run?.chunksEmbedded ?? 0,
      totalChunks: run?.totalChunks ?? 0,
      coverage: run?.coverage ?? {},
      failure: run?.failure ?? null,
      indexId: index?.id ?? null,
    };
  }
  async prepare(userId: string, bookId: string) {
    if (!this.config.embeddingReady)
      throw new ServiceUnavailableException('Project embedding service is not configured.');
    const book = await this.books.owned(userId, bookId, true);
    if (
      !book.pageCount ||
      book.pageCount > this.config.maxPages ||
      book.size > this.config.maxFileBytes
    )
      throw new BadRequestException(
        `The entire book must fit the ${this.config.maxPages}-page and ${this.config.maxFileBytes / 1048576}-MB indexing limits. No partial index will be activated.`,
      );
    await this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ai-quota:${userId}`]);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `prepare:${userId}:${bookId}`,
      ]);
      let index = await m.getRepository(AiIndex).findOneBy({
        userId,
        bookId,
        documentVersion: book.id,
        configKey: this.config.embeddingKey,
      });
      let run = index
        ? await m.getRepository(AiRun).findOneBy({ indexId: index.id, userId })
        : null;
      if (run && ['QUEUED', 'PROCESSING', 'READY'].includes(run.status)) return;
      const active = await m.query(
        `SELECT count(*)::int total FROM ai_runs WHERE "userId"=$1 AND status IN ('QUEUED','PROCESSING')`,
        [userId],
      );
      if (active[0].total >= 2)
        throw new ConflictException('Two books are already queued or processing.');
      if (!index)
        index = await m.getRepository(AiIndex).save({
          userId,
          bookId,
          documentVersion: book.id,
          configKey: this.config.embeddingKey,
          configuration: this.config.embedding,
          dimensions: this.config.embedding.dimensions,
          status: 'QUEUED',
          active: false,
        });
      if (!run)
        run = await m
          .getRepository(AiRun)
          .save({ userId, bookId, indexId: index.id, status: 'QUEUED' });
      await this.quotas.reserve(userId, run.id, 'INDEX_PAGES', book.pageCount!, m);
      await m.getRepository(AiRun).update(run.id, {
        status: 'QUEUED',
        failure: null,
        attempts: 0,
        leaseToken: null,
        leaseUntil: null,
        availableAt: () => 'CURRENT_TIMESTAMP',
      });
      await m.getRepository(AiIndex).update(index.id, { status: 'QUEUED', active: false });
    });
    return this.status(userId, bookId);
  }
  async cancel(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    await this.db.query(
      `UPDATE ai_runs SET status='CANCELLED', "leaseToken"=NULL, "leaseUntil"=NULL WHERE "userId"=$1 AND "bookId"=$2 AND status IN ('QUEUED','PROCESSING')`,
      [userId, bookId],
    );
    await this.db.query(
      `UPDATE ai_indexes SET status='CANCELLED',active=false WHERE "userId"=$1 AND "bookId"=$2 AND status IN ('QUEUED','PROCESSING')`,
      [userId, bookId],
    );
    await this.db.query(
      `UPDATE ai_usage u SET status='CANCELLED',units=LEAST(u.units,r."pagesProcessed"),"updatedAt"=now() FROM ai_runs r WHERE u."requestId"=r.id AND u."userId"=r."userId" AND u.kind='INDEX_PAGES' AND r."userId"=$1 AND r."bookId"=$2 AND r.status='CANCELLED'`,
      [userId, bookId],
    );
    return this.status(userId, bookId);
  }
  /** Database lease claim makes workers restartable and safe across API instances. */
  async claim(): Promise<AiRun | null> {
    return this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtextextended('ai-worker-slots',0))`);
      const [active] = await m.query(
        `SELECT count(*)::int total FROM ai_runs WHERE status='PROCESSING' AND "leaseUntil">now()`,
      );
      if (active.total >= this.config.workers) return null;
      const [row] = await m.query(
        `SELECT r.id FROM ai_runs r JOIN ai_indexes i ON i.id=r."indexId" JOIN books b ON b.id=r."bookId" AND b."userId"=r."userId" WHERE b.status='READY' AND i."configKey"=$1 AND r."availableAt"<=now() AND (r.status='QUEUED' OR (r.status='PROCESSING' AND r."leaseUntil"<now())) ORDER BY r."createdAt" FOR UPDATE OF r SKIP LOCKED LIMIT 1`,
        [this.config.embeddingKey],
      );
      if (!row) return null;
      const token = randomUUID();
      await m.query(
        `UPDATE ai_runs SET status='PROCESSING', "leaseToken"=$2,"leaseUntil"=now()+interval '4 minutes',"updatedAt"=now() WHERE id=$1`,
        [row.id, token],
      );
      const run = await m.getRepository(AiRun).findOneByOrFail({ id: row.id });
      await m.getRepository(AiIndex).update(run.indexId, { status: 'PROCESSING' });
      return run;
    });
  }
  async tick() {
    if (this.busy || this.stopping || !this.config.embeddingReady) return;
    this.busy = true;
    try {
      const run = await this.claim();
      if (run) await this.process(run);
    } finally {
      this.busy = false;
    }
  }
  private async alive(run: AiRun, manager: EntityManager = this.db.manager) {
    const rows = await manager.query(
      `UPDATE ai_runs r SET "leaseUntil"=now()+interval '4 minutes',"updatedAt"=now() FROM books b WHERE r.id=$1 AND r."leaseToken"=$2 AND r.status='PROCESSING' AND b.id=r."bookId" AND b."userId"=r."userId" AND b.status='READY' RETURNING r.id`,
      [run.id, run.leaseToken],
    );
    const affected = Array.isArray(rows[0]) ? rows[0].length : rows.length;
    if (!affected || this.stopping) throw new ProviderFailure('CANCELLED');
  }
  async process(run: AiRun) {
    const controller = new AbortController();
    this.controllers.add(controller);
    const heartbeat = setInterval(() => void this.alive(run).catch(() => controller.abort()), 1000);
    heartbeat.unref();
    let pdf: Awaited<ReturnType<PdfExtractor['open']>> | undefined;
    try {
      await this.alive(run);
      const book = await this.books.owned(run.userId, run.bookId, true);
      const object = await this.storage.get(book.objectKey);
      const bytes = await object.Body!.transformToByteArray();
      if (bytes.byteLength > this.config.maxFileBytes)
        throw new BadRequestException('PDF exceeds indexing file limit.');
      pdf = await this.extractor.open(bytes);
      if (pdf.count !== book.pageCount || pdf.count > this.config.maxPages)
        throw new BadRequestException('Document page count exceeds limits or changed.');
      const repo = this.db.getRepository(AiPage);
      let chars = Number(
        (
          await this.db.query(
            `SELECT COALESCE(sum(octet_length(text)),0) total FROM ai_pages WHERE "indexId"=$1`,
            [run.indexId],
          )
        )[0].total,
      );
      for (let page = 1; page <= pdf.count; page++) {
        await this.alive(run);
        if (controller.signal.aborted) throw new ProviderFailure('CANCELLED');
        const existing = await repo.findOneBy({ indexId: run.indexId, page });
        if (existing) continue;
        let text = '',
          failed = false;
        let deadline: NodeJS.Timeout | undefined;
        try {
          text = await Promise.race([
            pdf.page(page),
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => reject(new Error('Page extraction timeout')), 30000);
            }),
          ]);
        } catch {
          failed = true;
        } finally {
          clearTimeout(deadline);
        }
        chars += Buffer.byteLength(text);
        if (chars > this.config.maxTextBytes)
          throw new BadRequestException(
            'Extracted text exceeds the configured whole-book limit. No partial index is activated.',
          );
        const chunks = tokenChunks(
          text,
          page,
          `${book.id}:${this.config.embeddingKey}`,
          this.config.embedding.tokens,
          this.config.embedding.overlap,
        );
        await this.db.transaction(async (m) => {
          await this.alive(run, m);
          await m.getRepository(AiPage).insert({
            userId: run.userId,
            bookId: book.id,
            indexId: run.indexId,
            page,
            text,
            failed,
          });
          for (const chunk of chunks)
            await m.getRepository(AiChunk).insert({
              userId: run.userId,
              bookId: book.id,
              documentVersion: book.id,
              indexId: run.indexId,
              ...chunk,
            });
          const count = await m.getRepository(AiChunk).countBy({ indexId: run.indexId });
          if (count > this.config.maxChunks)
            throw new BadRequestException(
              'Book exceeds the configured chunk limit. No partial index is activated.',
            );
          await m.getRepository(AiRun).update(run.id, { pagesProcessed: page, totalChunks: count });
        });
      }
      const pages = await repo.find({
        where: { indexId: run.indexId },
        select: { page: true, text: true, failed: true },
        order: { page: 'ASC' },
      });
      const coverage = {
        textPages: pages.filter((p) => p.text.trim() && !p.failed).map((p) => p.page),
        emptyPages: pages.filter((p) => !p.text.trim() && !p.failed).map((p) => p.page),
        failedPages: pages.filter((p) => p.failed).map((p) => p.page),
        limitations: [] as string[],
      };
      if (coverage.emptyPages.length)
        coverage.limitations.push(
          'Pages without extracted text may be blank or scanned. Answers cover extracted text only; OCR is not available.',
        );
      if (coverage.failedPages.length)
        coverage.limitations.push(
          'Some pages could not be extracted. Retry preparation; this index is not ready.',
        );
      await this.db
        .getRepository(AiRun)
        .update(
          { id: run.id, leaseToken: run.leaseToken! },
          { coverage, pagesProcessed: pages.length },
        );
      if (coverage.failedPages.length) {
        // Failed pages are retried on the next explicit preparation, completed pages remain durable.
        await repo.delete({ indexId: run.indexId, failed: true });
        throw new BadRequestException(
          'Page extraction failed. Retry preparation to resume; no incomplete index is activated.',
        );
      }
      if (!coverage.textPages.length)
        throw new BadRequestException(
          'No usable text was extracted. This book requires OCR before text-based AI preparation.',
        );
      while (true) {
        await this.alive(run);
        const chunks = await this.db.getRepository(AiChunk).find({
          where: { indexId: run.indexId, embedding: IsNull() },
          order: { id: 'ASC' },
          take: this.config.batchSize,
        });
        if (!chunks.length) break;
        const usage = await this.quotas.reserve(
          run.userId,
          randomUUID(),
          'DOCUMENT_EMBEDDING',
          chunks.reduce((n, c) => n + c.tokens, 0),
        );
        const started = Date.now();
        await this.quotas.start(usage.id, 'openai', this.config.embedding.model);
        try {
          const embedded = await this.embeddings.process(
            chunks.map((c) => c.text),
            'document',
            controller.signal,
          );
          await this.db.transaction(async (m) => {
            await this.alive(run, m);
            for (let i = 0; i < chunks.length; i++) {
              const vector = embedded.vectors[i];
              if (
                !vector ||
                vector.length !== this.config.embedding.dimensions ||
                vector.some((n) => !Number.isFinite(n)) ||
                !vector.some((n) => n !== 0)
              )
                throw new ProviderFailure('INCOMPATIBLE');
              await m.query(
                `UPDATE ai_chunks SET embedding=$1::vector WHERE id=$2 AND "indexId"=$3`,
                [JSON.stringify(vector), chunks[i].id, run.indexId],
              );
            }
            await m.query(
              `UPDATE ai_runs SET "chunksEmbedded"=(SELECT count(*) FROM ai_chunks WHERE "indexId"=$2 AND embedding IS NOT NULL) WHERE id=$1`,
              [run.id, run.indexId],
            );
          });
          await this.quotas.finish(
            usage.id,
            'COMPLETED',
            embedded.usage,
            Date.now() - started,
            Number.isSafeInteger(embedded.usage?.inputTokens) && embedded.usage!.inputTokens! >= 0
              ? embedded.usage!.inputTokens
              : undefined,
          );
        } catch (error) {
          await this.quotas.finish(
            usage.id,
            controller.signal.aborted ? 'CANCELLED' : 'FAILED',
            undefined,
            Date.now() - started,
          );
          throw error;
        }
      }
      await this.db.transaction(async (m) => {
        await this.alive(run, m);
        const owned = await m.query(
          `SELECT id FROM books WHERE id=$1 AND "userId"=$2 AND status='READY' FOR UPDATE`,
          [book.id, run.userId],
        );
        if (!owned.length) throw new ProviderFailure('CANCELLED');
        const [check] = await m.query(
          `SELECT count(*)::int total,count(embedding)::int embedded FROM ai_chunks WHERE "indexId"=$1`,
          [run.indexId],
        );
        if (!check.total || check.total !== check.embedded)
          throw new Error('Incomplete embeddings');
        await m
          .getRepository(AiIndex)
          .update({ userId: run.userId, bookId: book.id }, { active: false });
        await m.getRepository(AiIndex).update(run.indexId, { status: 'READY', active: true });
        await m
          .getRepository(AiRun)
          .update(run.id, { status: 'READY', leaseToken: null, leaseUntil: null, failure: null });
      });
      await this.db.query(
        `UPDATE ai_usage SET status='COMPLETED',"updatedAt"=now() WHERE "requestId"=$1 AND "userId"=$2 AND kind='INDEX_PAGES'`,
        [run.id, run.userId],
      );
    } catch (error) {
      const retry =
        error instanceof ProviderFailure && error.retryable && run.attempts < 2 && !this.stopping;
      const message =
        error instanceof BadRequestException
          ? error.message
          : error instanceof ProviderFailure
            ? error.message
            : 'Book processing failed. Retry preparation to resume saved progress.';
      const status = retry ? 'QUEUED' : controller.signal.aborted ? 'CANCELLED' : 'FAILED';
      if (!this.stopping)
        await this.db.transaction(async (m) => {
          const changed = await m.getRepository(AiRun).update(
            { id: run.id, leaseToken: run.leaseToken!, status: 'PROCESSING' },
            {
              status,
              attempts: run.attempts + 1,
              failure: message,
              leaseToken: null,
              leaseUntil: null,
              availableAt: new Date(Date.now() + Math.pow(2, run.attempts) * 5000),
            },
          );
          if (changed.affected)
            await m.getRepository(AiIndex).update(run.indexId, { status, active: false });
          if (changed.affected && !retry)
            await m.query(
              `UPDATE ai_usage u SET status=$3,units=LEAST(u.units,r."pagesProcessed"),"updatedAt"=now() FROM ai_runs r WHERE r.id=$1 AND u."requestId"=r.id AND u."userId"=$2 AND u.kind='INDEX_PAGES'`,
              [run.id, run.userId, status],
            );
        });
      // During shutdown retain PROCESSING + lease for restart recovery, never restart generation.
    } finally {
      clearInterval(heartbeat);
      this.controllers.delete(controller);
      await pdf?.close().catch(() => undefined);
    }
  }
}
