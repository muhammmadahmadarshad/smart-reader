import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BooksService } from '../books/books.service';
import { Bookmark } from './entities/bookmark.entity';
import { CreateBookmarkDto } from './dto/bookmark.dto';
@Injectable()
export class BookmarksService {
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
  ) {}
  private get repo() {
    return this.db.getRepository(Bookmark);
  }
  async list(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    return this.repo.find({ where: { userId, bookId }, order: { page: 'ASC' } });
  }
  async create(userId: string, bookId: string, dto: CreateBookmarkDto) {
    const book = await this.books.owned(userId, bookId, true);
    if (!book.pageCount || dto.page > book.pageCount)
      throw new BadRequestException(`Page must be between 1 and ${book.pageCount || 1}.`);
    await this.repo.upsert({ userId, bookId, ...dto }, ['userId', 'bookId', 'page']);
    return this.repo.findOneByOrFail({ userId, bookId, page: dto.page });
  }
  async rename(userId: string, bookId: string, id: string, label: string) {
    await this.books.owned(userId, bookId, true);
    const result = await this.repo.update({ id, userId, bookId }, { label });
    if (!result.affected) throw new NotFoundException('Bookmark not found.');
    return this.repo.findOneByOrFail({ id, userId, bookId });
  }
  async remove(userId: string, bookId: string, id: string) {
    await this.books.owned(userId, bookId, true);
    const result = await this.repo.delete({ id, userId, bookId });
    if (!result.affected) throw new NotFoundException('Bookmark not found.');
    return { message: 'Bookmark removed.' };
  }
}
