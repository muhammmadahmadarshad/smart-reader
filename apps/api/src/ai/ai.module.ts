import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { AnnotationsModule } from '../annotations/annotations.module';
import { AI_CONFIG, readAiConfig } from './ai.config';
import { AiController } from './ai.controller';
import { ReadingContextService } from './reading-context.service';
import { DisabledEmbeddings, DisabledGeneration, DisabledRetrieval } from './disabled.providers';
import { EMBEDDER, PASSAGE_RETRIEVER, TEXT_GENERATOR, TEXT_STREAMER } from './providers';
import { AI_WORKFLOWS } from './workflows';
import { LangGraphWorkflows } from './langgraph.workflows';
@Module({
  imports: [AuthModule, BooksModule, AnnotationsModule],
  controllers: [AiController],
  providers: [
    {
      provide: AI_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        readAiConfig(
          Object.fromEntries(
            [
              'AI_ENABLED',
              'AI_PROVIDER',
              'RAG_ENABLED',
              'AI_CONTEXT_SELECTION_CHARS',
              'AI_CONTEXT_SURROUNDING_CHARS',
              'AI_CONTEXT_QUESTION_CHARS',
              'AI_CONTEXT_NOTE_CHARS',
              'AI_CONTEXT_TOTAL_CHARS',
              'RAG_CHUNK_CHARS',
              'RAG_CHUNK_OVERLAP_CHARS',
              'LANGSMITH_TRACING',
              'LANGCHAIN_TRACING_V2',
              'LANGCHAIN_TRACING',
              'LANGCHAIN_VERBOSE',
            ].map((key) => [key, config.get(key)]),
          ),
        ),
    },
    ReadingContextService,
    DisabledGeneration,
    DisabledEmbeddings,
    DisabledRetrieval,
    { provide: AI_WORKFLOWS, useClass: LangGraphWorkflows },
    { provide: TEXT_GENERATOR, useExisting: DisabledGeneration },
    { provide: TEXT_STREAMER, useExisting: DisabledGeneration },
    { provide: EMBEDDER, useExisting: DisabledEmbeddings },
    { provide: PASSAGE_RETRIEVER, useExisting: DisabledRetrieval },
  ],
  exports: [
    ReadingContextService,
    TEXT_GENERATOR,
    TEXT_STREAMER,
    EMBEDDER,
    PASSAGE_RETRIEVER,
    AI_WORKFLOWS,
  ],
})
export class AiModule {}
