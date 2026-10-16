import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  HttpException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { BooksService } from '../books/books.service';
import { AiConnection, AiConversation, AiMessage } from './entities/ai.entities';
import { ConnectionsService } from './connections.service';
import { AssistantWorkflow, AssistantEvent } from './assistant-workflow';
import { QuotaService } from './quota.service';
import type { SelectionContextInput } from './contracts';
import { AssistantConfig } from './assistant.config';
import { AiError } from './ai.error';
import { ProviderFailure } from './project-embeddings';
export type AskInput = {
  requestId: string;
  conversationId: string;
  connectionId: string;
  model: string;
  question: string;
  selection?: SelectionContextInput;
};
@Injectable()
export class ConversationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private active = new Map<string, AbortController>();
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
    private readonly connections: ConnectionsService,
    private readonly workflow: AssistantWorkflow,
    private readonly quotas: QuotaService,
    private readonly config: AssistantConfig,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.recover().catch(() => undefined), 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
    for (const c of this.active.values()) c.abort();
  }
  async recover() {
    await this.db.query(
      `UPDATE ai_messages SET status=CASE WHEN answer='' THEN 'FAILED' ELSE 'INCOMPLETE' END,error='Request interrupted. Retry explicitly; generation is not restarted automatically.' WHERE status='PENDING' AND "updatedAt"<now()-interval '5 minutes'`,
    );
    await this.db.query(
      `UPDATE ai_usage SET units=CASE WHEN status='RESERVED' THEN 0 ELSE units END,status='FAILED',"updatedAt"=now() WHERE kind IN ('USER_LLM','QUERY_EMBEDDING','DOCUMENT_EMBEDDING') AND status IN ('RESERVED','STARTED') AND "updatedAt"<now()-interval '5 minutes'`,
    );
  }
  async list(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    return this.db
      .getRepository(AiConversation)
      .find({ where: { userId, bookId }, order: { createdAt: 'DESC' }, take: 100 });
  }
  async create(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    if ((await this.db.getRepository(AiConversation).countBy({ userId, bookId })) >= 100)
      throw new BadRequestException('Remove an old conversation before creating another.');
    return this.db
      .getRepository(AiConversation)
      .save({ userId, bookId, title: 'New conversation' });
  }
  async owned(userId: string, bookId: string, id: string) {
    await this.books.owned(userId, bookId, true);
    const c = await this.db.getRepository(AiConversation).findOneBy({ id, userId, bookId });
    if (!c) throw new NotFoundException('Conversation not found.');
    return c;
  }
  async messages(userId: string, bookId: string, id: string) {
    await this.owned(userId, bookId, id);
    return this.db.getRepository(AiMessage).find({
      where: { userId, bookId, conversationId: id },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }
  async remove(userId: string, bookId: string, id: string) {
    await this.owned(userId, bookId, id);
    await this.db.getRepository(AiConversation).delete({ id, userId, bookId });
    return { message: 'Conversation deleted.' };
  }
  async cancel(userId: string, bookId: string, requestId: string) {
    await this.books.owned(userId, bookId, true);
    await this.db
      .getRepository(AiMessage)
      .update(
        { userId, bookId, requestId, status: 'PENDING' },
        { status: 'CANCELLED', error: 'Cancelled; any partial response is incomplete.' },
      );
    this.active.get(`${userId}:${requestId}`)?.abort();
    return { message: 'Cancellation requested. Provider charges may already have been incurred.' };
  }
  async ask(
    userId: string,
    bookId: string,
    input: AskInput,
    signal: AbortSignal,
    emit: (event: AssistantEvent) => void,
  ) {
    if (!this.config.connectionsEnabled)
      throw new BadRequestException('AI connections are unavailable.');
    await this.owned(userId, bookId, input.conversationId);
    if (!input.question.trim() || input.question.includes('\0'))
      throw new BadRequestException('A nonempty question is required.');
    if (
      input.selection &&
      (input.selection.bookId !== bookId || input.selection.documentVersion !== bookId)
    )
      throw new BadRequestException('Selection belongs to another document.');
    const connection = await this.connections.owned(userId, input.connectionId);
    if (connection.validation !== 'VALID' || !connection.validatedModels.includes(input.model))
      throw new BadRequestException(
        'Add and validate the selected connection/model in AI Settings.',
      );
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const message = await this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `ask:${userId}:${input.requestId}`,
      ]);
      const repo = m.getRepository(AiMessage),
        existing = await repo.findOneBy({ userId, requestId: input.requestId });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ConflictException('Request ID was already used for different content.');
        return { record: existing, fresh: false };
      }
      const pending = await repo.findOneBy({
        userId,
        conversationId: input.conversationId,
        status: 'PENDING',
      });
      if (pending) throw new ConflictException('A request is already active in this conversation.');
      if ((await repo.countBy({ userId, conversationId: input.conversationId })) >= 200)
        throw new BadRequestException('Create a new conversation after 200 requests.');
      await this.quotas.reserve(userId, input.requestId, 'USER_LLM', 1, m);
      const record = await repo.save({
        userId,
        bookId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        requestHash,
        question: input.question,
        connectionId: input.connectionId,
        provider: connection.provider,
        model: input.model,
        action: input.selection?.action ?? 'ASK_BOOK',
        selection: input.selection ?? null,
        status: 'PENDING',
      });
      return { record, fresh: true };
    });
    if (!message.fresh) return message.record;
    await this.db
      .getRepository(AiConversation)
      .update(
        { id: input.conversationId, userId, bookId },
        { title: input.question.slice(0, 100) },
      );
    const controller = new AbortController(),
      key = `${userId}:${input.requestId}`;
    this.active.set(key, controller);
    const combined = AbortSignal.any([
      signal,
      controller.signal,
      AbortSignal.timeout(this.config.timeout + 30000),
    ]);
    let partial = '',
      savedLength = 0;
    const heartbeat = setInterval(
      () =>
        void (async () => {
          const record = await this.db
            .getRepository(AiMessage)
            .findOneBy({ id: message.record.id, userId, status: 'PENDING' });
          const current = await this.db
            .getRepository(AiConnection)
            .findOneBy({ id: input.connectionId, userId });
          try {
            await this.books.owned(userId, bookId, true);
          } catch {
            controller.abort();
            return;
          }
          if (!record || !current || current.revision !== connection.revision) {
            controller.abort();
            return;
          }
          await this.db
            .getRepository(AiMessage)
            .update(
              { id: record.id, status: 'PENDING' },
              { answer: partial, updatedAt: new Date() },
            );
          savedLength = partial.length;
        })().catch(() => controller.abort()),
      1000,
    );
    heartbeat.unref();
    try {
      const previous = await this.db.getRepository(AiMessage).find({
        where: { userId, bookId, conversationId: input.conversationId, status: 'COMPLETED' },
        order: { createdAt: 'DESC' },
        take: 4,
      });
      const history = previous.reverse().flatMap((m) => [
        { role: 'user' as const, content: m.question.slice(0, 1000) },
        { role: 'assistant' as const, content: m.answer.slice(0, 2000) },
      ]);
      // Remove complete oldest turns to preserve recent follow-ups within the byte budget.
      while (
        history.length &&
        Buffer.byteLength(JSON.stringify(history)) > Math.min(6000, this.config.inputBytes / 4)
      )
        history.splice(0, 2);
      const result = await this.workflow.run(
        { userId, bookId, ...input, history },
        combined,
        (event) => {
          if (event.type === 'text_delta') partial += event.text;
          emit(event);
        },
      );
      await this.db.getRepository(AiMessage).update(
        { id: message.record.id, userId, status: 'PENDING' },
        {
          answer: result.answer,
          status: result.status,
          citations: result.citations,
          usage: result.usage ?? null,
          model: result.model,
          provider: result.provider,
          error: result.error ?? null,
        },
      );
      // If evidence was insufficient, no paid model call was started: release its reservation.
      await this.db.query(
        `UPDATE ai_usage SET units=0,status='COMPLETED',"updatedAt"=now() WHERE "userId"=$1 AND "requestId"=$2 AND kind='USER_LLM' AND status='RESERVED'`,
        [userId, input.requestId],
      );
    } catch (error) {
      const safe =
        error instanceof HttpException ||
        error instanceof AiError ||
        error instanceof ProviderFailure
          ? error.message
          : 'The request could not complete. Check connection and index status, then retry explicitly.';
      await this.db.getRepository(AiMessage).update(
        { id: message.record.id, userId, status: 'PENDING' },
        {
          answer: partial,
          status: partial ? 'INCOMPLETE' : combined.aborted ? 'CANCELLED' : 'FAILED',
          error: combined.aborted
            ? 'Cancelled; charges may already have been incurred.'
            : safe.slice(0, 500),
        },
      );
      await this.db.query(
        `UPDATE ai_usage SET units=CASE WHEN status='RESERVED' THEN 0 ELSE units END,status='FAILED',"updatedAt"=now() WHERE "userId"=$1 AND "requestId"=$2 AND kind='USER_LLM' AND status IN ('RESERVED','STARTED')`,
        [userId, input.requestId],
      );
    } finally {
      clearInterval(heartbeat);
      this.active.delete(key);
      if (combined.aborted && partial.length > savedLength)
        await this.db
          .getRepository(AiMessage)
          .update(
            { id: message.record.id, userId, status: 'CANCELLED' },
            { answer: partial, status: 'INCOMPLETE' },
          );
    }
    return this.db.getRepository(AiMessage).findOneBy({ id: message.record.id, userId });
  }
}
