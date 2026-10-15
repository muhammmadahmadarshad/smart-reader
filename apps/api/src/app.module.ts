import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { BooksModule } from './books/books.module';
import { ReadingProgressModule } from './reading-progress/reading-progress.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { validateEnvironment } from './common/environment';
import { AiModule } from './ai/ai.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    TypeOrmModule.forRoot(databaseOptions),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    AuthModule,
    BooksModule,
    ReadingProgressModule,
    BookmarksModule,
    AnnotationsModule,
    AiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
