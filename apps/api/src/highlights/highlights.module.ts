import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { HighlightsController } from './highlights.controller';
import { HighlightsService } from './highlights.service';
@Module({
  imports: [AuthModule, BooksModule],
  controllers: [HighlightsController],
  providers: [HighlightsService],
})
export class HighlightsModule {}
