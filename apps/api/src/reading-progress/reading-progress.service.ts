import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BooksService } from '../books/books.service';
import { Book } from '../books/entities/book.entity';
import { ReadingProgress } from './entities/reading-progress.entity';
@Injectable()
export class ReadingProgressService {
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
  ) {}
  async open(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    await this.db
      .getRepository(Book)
      .update({ id: bookId, userId, status: 'READY' }, { lastOpenedAt: new Date() });
    return this.books.get(userId, bookId);
  }
  async save(userId: string, bookId: string, page: number) {
    const book = await this.books.owned(userId, bookId, true);
    if (!book.pageCount || page > book.pageCount)
      throw new BadRequestException(`Page must be between 1 and ${book.pageCount || 1}.`);
    await this.db
      .getRepository(ReadingProgress)
      .upsert({ userId, bookId, page }, ['userId', 'bookId']);
    return this.db.getRepository(ReadingProgress).findOneByOrFail({ userId, bookId });
  }
}
