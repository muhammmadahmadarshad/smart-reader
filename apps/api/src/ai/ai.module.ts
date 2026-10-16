import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { AnnotationsModule } from '../annotations/annotations.module';
import { StorageModule } from '../storage/storage.module';
import { AI_CONFIG, readAiConfig } from './ai.config';
import { AiController } from './ai.controller';
import { ReadingContextService } from './reading-context.service';
import { AssistantConfig } from './assistant.config';
import { CredentialsService } from './credentials.service';
import { EndpointPolicy } from './endpoint-policy';
import { ConnectionsService } from './connections.service';
import { QuotaService } from './quota.service';
import { ProjectEmbeddings, PROJECT_EMBEDDER } from './project-embeddings';
import { UserModelProvider, USER_MODEL } from './user-model.provider';
import { IndexingService, PdfTextExtractor, PDF_EXTRACTOR } from './indexing.service';
import { RetrievalService } from './retrieval.service';
import { AssistantWorkflow } from './assistant-workflow';
import { ConversationsService } from './conversations.service';
import { TEXT_GENERATOR, TEXT_STREAMER, EMBEDDER } from './providers';
@Module({
  imports: [AuthModule, BooksModule, AnnotationsModule, StorageModule],
  controllers: [AiController],
  providers: [
    {
      provide: AI_CONFIG,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        readAiConfig(
          Object.fromEntries(
            [
              'AI_CONTEXT_SELECTION_CHARS',
              'AI_CONTEXT_SURROUNDING_CHARS',
              'AI_CONTEXT_QUESTION_CHARS',
              'AI_CONTEXT_NOTE_CHARS',
              'AI_CONTEXT_TOTAL_CHARS',
              'RAG_CHUNK_CHARS',
              'RAG_CHUNK_OVERLAP_CHARS',
            ].map((k) => [k, c.get(k)]),
          ),
        ),
    },
    AssistantConfig,
    CredentialsService,
    EndpointPolicy,
    ConnectionsService,
    QuotaService,
    ReadingContextService,
    IndexingService,
    RetrievalService,
    AssistantWorkflow,
    ConversationsService,
    { provide: PROJECT_EMBEDDER, useClass: ProjectEmbeddings },
    { provide: USER_MODEL, useClass: UserModelProvider },
    { provide: PDF_EXTRACTOR, useClass: PdfTextExtractor },
    { provide: TEXT_GENERATOR, useExisting: USER_MODEL },
    { provide: TEXT_STREAMER, useExisting: USER_MODEL },
    { provide: EMBEDDER, useExisting: PROJECT_EMBEDDER },
  ],
  exports: [
    ReadingContextService,
    IndexingService,
    AssistantWorkflow,
    ConversationsService,
    ConnectionsService,
  ],
})
export class AiModule {}
