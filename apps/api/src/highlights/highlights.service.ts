import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BooksService } from '../books/books.service';
import { Highlight } from './entities/highlight.entity';
import { CreateHighlightDto } from './dto/highlight.dto';
@Injectable()
export class HighlightsService {
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
  ) {}
  private get repo() {
    return this.db.getRepository(Highlight);
  }
  async list(userId: string, bookId: string, page: number) {
    const book = await this.books.owned(userId, bookId, true);
    if (page > (book.pageCount || 1))
      throw new BadRequestException('Page is outside this document.');
    return this.repo.find({ where: { userId, bookId, page }, order: { createdAt: 'ASC' } });
  }
  async create(userId: string, bookId: string, dto: CreateHighlightDto) {
    const book = await this.books.owned(userId, bookId, true);
    if (dto.page > (book.pageCount || 1))
      throw new BadRequestException('Page is outside this document.');
    if (dto.rectangles.some((r) => r.x + r.width > 1.000001 || r.y + r.height > 1.000001))
      throw new BadRequestException('Highlight rectangles must stay inside the page.');
    return this.repo.save(this.repo.create({ ...dto, userId, bookId }));
  }
  async remove(userId: string, bookId: string, id: string) {
    await this.books.owned(userId, bookId, true);
    const result = await this.repo.delete({ id, userId, bookId });
    if (!result.affected) throw new NotFoundException('Highlight not found.');
    return { message: 'Highlight removed.' };
  }
}
