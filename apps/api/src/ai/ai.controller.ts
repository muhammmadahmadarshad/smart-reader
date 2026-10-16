import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ConnectionsService } from './connections.service';
import { AssistantConfig } from './assistant.config';
import { IndexingService } from './indexing.service';
import { ConversationsService } from './conversations.service';
import { QuotaService } from './quota.service';
import { USER_MODEL, UserModel } from './user-model.provider';
import { AskDto, ConnectionDto, ModelDto, PreferenceDto } from './assistant.dto';
@Catch()
class AiSafeErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const body = error instanceof HttpException ? error.getResponse() : null;
    response.status(status).json({
      statusCode: status,
      message:
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown })?.message ??
            'AI request failed. Check the connection and retry explicitly.'),
    });
  }
}
@ApiTags('AI assistant')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Session required' })
@UseGuards(AuthGuard)
@UseFilters(AiSafeErrorFilter)
@Controller('ai')
export class AiController {
  constructor(
    private readonly config: AssistantConfig,
    private readonly connections: ConnectionsService,
    private readonly indexing: IndexingService,
    private readonly conversations: ConversationsService,
    private readonly quotas: QuotaService,
    @Inject(USER_MODEL) private readonly model: UserModel,
  ) {}
  @Get('capabilities')
  @ApiOperation({ summary: 'User-scoped capabilities; no keys or project credentials returned' })
  async capabilities(@CurrentUser() user: string) {
    const connections = await this.connections.list(user);
    const usable = connections.filter((c) => c.validation === 'VALID' && c.validatedModels.length);
    return {
      generation: this.config.connectionsEnabled && usable.length > 0,
      streaming: this.config.connectionsEnabled && usable.some((c) => c.streaming),
      embeddings: this.config.embeddingReady,
      retrieval: this.config.embeddingReady,
      connectionsEnabled: this.config.connectionsEnabled,
      reason: !this.config.connectionsEnabled
        ? this.config.enabled
          ? 'Administrator must configure AI credential encryption.'
          : 'AI is disabled by the administrator.'
        : !usable.length
          ? 'Add and validate an LLM connection.'
          : null,
    };
  }
  @Get('connections') list(@CurrentUser() user: string) {
    return this.connections.list(user);
  }
  @Post('connections')
  @ApiOperation({
    summary: 'Store an encrypted user-owned LLM connection (does not validate or generate)',
  })
  create(@CurrentUser() user: string, @Body() body: ConnectionDto) {
    return this.connections.save(user, body);
  }
  @Patch('connections/:id') edit(
    @CurrentUser() user: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConnectionDto,
  ) {
    return this.connections.save(user, body, id);
  }
  @Delete('connections/:id') remove(
    @CurrentUser() user: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.connections.remove(user, id);
  }
  @Get('connections/:id/models') models(
    @CurrentUser() user: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.model.models(user, id);
  }
  @Post('connections/:id/validate')
  @ApiOperation({
    summary: 'Explicit small text-generation test charged to the user provider account',
  })
  async validate(
    @CurrentUser() user: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ModelDto,
  ) {
    const c = await this.connections.owned(user, id);
    const usage = await this.quotas.reserve(user, randomUUID(), 'USER_LLM', 1);
    await this.quotas.start(usage.id, c.provider, body.model);
    const started = Date.now();
    try {
      const result = await this.model.validate(user, id, body.model);
      await this.quotas.finish(usage.id, 'COMPLETED', result.usage, Date.now() - started);
      return result.connection;
    } catch (error) {
      await this.quotas.finish(usage.id, 'FAILED', undefined, Date.now() - started);
      throw error;
    }
  }
  @Get('preferences') preference(@CurrentUser() user: string) {
    return this.connections.preference(user);
  }
  @Put('preferences') setPreference(@CurrentUser() user: string, @Body() body: PreferenceDto) {
    return this.connections.preference(user, body);
  }
  @Get('books/:bookId/index') index(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
  ) {
    return this.indexing.status(user, book);
  }
  @Post('books/:bookId/prepare')
  @ApiOperation({
    summary: 'Idempotently queue/resume whole-book project-funded embedding preparation',
  })
  prepare(@CurrentUser() user: string, @Param('bookId', ParseUUIDPipe) book: string) {
    return this.indexing.prepare(user, book);
  }
  @Post('books/:bookId/cancel-index') cancelIndex(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
  ) {
    return this.indexing.cancel(user, book);
  }
  @Get('books/:bookId/conversations') listConversations(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
  ) {
    return this.conversations.list(user, book);
  }
  @Post('books/:bookId/conversations') createConversation(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
  ) {
    return this.conversations.create(user, book);
  }
  @Get('books/:bookId/conversations/:id') messages(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.messages(user, book, id);
  }
  @Delete('books/:bookId/conversations/:id') deleteConversation(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.remove(user, book, id);
  }
  @Post('books/:bookId/requests/:id/cancel') cancel(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.cancel(user, book, id);
  }
  @Post('books/:bookId/messages')
  @ApiProduces('application/x-ndjson')
  @ApiOperation({
    summary:
      'Authenticated CSRF-protected POST stream: status, text_delta, then result; no internal reasoning',
  })
  async ask(
    @CurrentUser() user: string,
    @Param('bookId', ParseUUIDPipe) book: string,
    @Body() body: AskDto,
    @Res() response: Response,
  ) {
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });
    response.setHeader('Content-Type', 'application/x-ndjson');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Accel-Buffering', 'no');
    const send = (event: unknown) => {
      if (!response.destroyed && !response.writableEnded)
        response.write(JSON.stringify(event) + '\n');
    };
    try {
      const result = await this.conversations.ask(user, book, body, controller.signal, send);
      send({ type: 'result', message: result });
    } catch (error) {
      if (!response.headersSent && error instanceof HttpException)
        response.status(error.getStatus());
      send({
        type: 'error',
        message:
          error instanceof HttpException
            ? error.message
            : 'Request could not complete. Check connection and index status.',
      });
    } finally {
      response.end();
    }
  }
}
