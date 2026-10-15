import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BooksModule } from '../books/books.module';
import { AnnotationsController } from './annotations.controller';
import { AnnotationsService } from './annotations.service';
@Module({
  imports: [AuthModule, BooksModule],
  controllers: [AnnotationsController],
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
