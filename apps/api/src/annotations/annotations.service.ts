import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BooksService } from '../books/books.service';
import { Annotation } from './entities/annotation.entity';
import { CreateAnnotationDto, ListAnnotationsDto, UpdateAnnotationDto } from './dto/annotation.dto';
@Injectable()
export class AnnotationsService {
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
  ) {}
  private get repo() {
    return this.db.getRepository(Annotation);
  }
  view(item: Annotation) {
    return {
      id: item.id,
      bookId: item.bookId,
      kind: item.kind,
      selectedText: item.selectedText,
      noteText: item.noteText,
      color: item.color,
      documentVersion: item.documentVersion,
      coordinateVersion: item.coordinateVersion,
      segments: item.segments,
      firstPage: item.firstPage,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
  async get(userId: string, bookId: string, id: string) {
    await this.books.owned(userId, bookId, true);
    const item = await this.repo.findOneBy({ id, userId, bookId, deleted: false });
    if (!item) throw new NotFoundException('Annotation not found.');
    return this.view(item);
  }
  async list(userId: string, bookId: string, dto: ListAnnotationsDto) {
    const book = await this.books.owned(userId, bookId, true);
    if (dto.documentPage && dto.documentPage > book.pageCount!)
      throw new BadRequestException('Page is outside this document.');
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.userId = :userId AND a.bookId = :bookId AND a.deleted = false', { userId, bookId });
    if (dto.filter === 'highlights') qb.andWhere("a.kind = 'HIGHLIGHT'");
    if (dto.filter === 'notes') qb.andWhere('a.noteText IS NOT NULL');
    if (dto.color) qb.andWhere('a.color = :color', { color: dto.color });
    if (dto.search.trim())
      qb.andWhere('(a.selectedText ILIKE :search OR a.noteText ILIKE :search)', {
        search: `%${dto.search.trim().replace(/[\\%_]/g, '\\$&')}%`,
      });
    if (dto.documentPage)
      qb.andWhere('a.segments @> CAST(:segment AS jsonb)', {
        segment: JSON.stringify([{ page: dto.documentPage }]),
      });
    if (dto.sort === 'updated') qb.orderBy('a.updatedAt', 'DESC');
    else qb.orderBy('a.firstPage', 'ASC', 'NULLS LAST').addOrderBy('a.createdAt', 'ASC');
    qb.addOrderBy('a.id', 'ASC');
    const [items, total] = await qb
      .skip((dto.page - 1) * dto.pageSize)
      .take(dto.pageSize)
      .getManyAndCount();
    return {
      items: items.map((item) => this.view(item)),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }
  async create(userId: string, bookId: string, dto: CreateAnnotationDto) {
    const book = await this.books.owned(userId, bookId, true);
    const noteText = dto.noteText?.trim() || null;
    const selectedText = dto.selectedText?.trim() || null;
    if (dto.kind === 'NOTE') {
      if (
        !noteText ||
        dto.selectedText != null ||
        dto.color != null ||
        dto.segments != null ||
        dto.documentVersion != null ||
        dto.coordinateVersion != null
      )
        throw new BadRequestException(
          'Standalone notes require note text and no selection, color, or geometry.',
        );
    } else {
      if (
        !selectedText ||
        !dto.color ||
        !dto.segments?.length ||
        dto.coordinateVersion !== 2 ||
        dto.documentVersion !== book.id
      )
        throw new BadRequestException(
          'Highlights require selected text, color, PDF geometry, coordinateVersion 2, and this document version.',
        );
      if (
        dto.segments.reduce((n, s) => n + s.rectangles.length, 0) > 500 ||
        new Set(dto.segments.map((s) => s.page)).size !== dto.segments.length
      )
        throw new BadRequestException('Use distinct page segments and at most 500 rectangles.');
      const boxes = await this.books.geometry(book);
      for (const segment of dto.segments) {
        const box = boxes[segment.page - 1];
        if (
          !box ||
          segment.rectangles.some(
            (r) =>
              r.x < box[0] - 0.01 ||
              r.y < box[1] - 0.01 ||
              r.x + r.width > box[2] + 0.01 ||
              r.y + r.height > box[3] + 0.01,
          )
        )
          throw new BadRequestException('Selection geometry is outside the document page.');
      }
    }
    const data = {
      kind: dto.kind,
      selectedText,
      noteText,
      color: dto.color ?? null,
      documentVersion: dto.documentVersion ?? null,
      coordinateVersion: dto.coordinateVersion ?? null,
      segments:
        dto.segments
          ?.map((segment) => ({
            page: segment.page,
            rectangles: segment.rectangles.map((r) => ({
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            })),
          }))
          .sort((a, b) => a.page - b.page) ?? null,
    };
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    // Unique key + ON CONFLICT makes concurrent retries safe. Tombstones prevent a late retry resurrecting deleted annotations.
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({
        ...data,
        userId,
        bookId,
        clientRequestId: dto.clientRequestId,
        requestHash,
        firstPage: dto.segments ? Math.min(...dto.segments.map((s) => s.page)) : null,
      })
      .orIgnore()
      .execute();
    const item = await this.repo.findOneByOrFail({
      userId,
      bookId,
      clientRequestId: dto.clientRequestId,
    });
    if (item.requestHash !== requestHash || item.deleted)
      throw new ConflictException(
        'This create request was already used or deleted. Reload before creating a new annotation.',
      );
    return this.view(item);
  }
  async update(userId: string, bookId: string, id: string, dto: UpdateAnnotationDto) {
    const item = await this.get(userId, bookId, id);
    const noteText = dto.noteText === undefined ? item.noteText : dto.noteText?.trim() || null;
    if (item.kind === 'NOTE' && (!noteText || dto.color !== undefined))
      throw new BadRequestException('Standalone notes require text and cannot have a color.');
    if (item.kind === 'HIGHLIGHT' && dto.color === null)
      throw new BadRequestException('Highlights require a supported color.');
    const result = await this.repo.update(
      { id, userId, bookId, version: dto.version, deleted: false },
      { noteText, color: dto.color ?? item.color, version: dto.version + 1 },
    );
    if (!result.affected)
      throw new ConflictException(
        'This annotation changed. Load the latest version and review your draft before saving again.',
      );
    return this.get(userId, bookId, id);
  }
  async remove(userId: string, bookId: string, id: string, version: number) {
    await this.get(userId, bookId, id);
    await this.db.transaction(async (manager) => {
      const result = await manager.getRepository(Annotation).update(
        { id, userId, bookId, version, deleted: false },
        {
          deleted: true,
          version: version + 1,
          selectedText: null,
          noteText: null,
          color: null,
          segments: null,
          documentVersion: null,
          coordinateVersion: null,
          firstPage: null,
        },
      );
      if (!result.affected)
        throw new ConflictException('This annotation changed. Reload before deleting.');
      // Remove the old copy too if this highlight predates Phase 4.
      await manager.query(
        'DELETE FROM highlights WHERE id = $1 AND "userId" = $2 AND "bookId" = $3',
        [id, userId, bookId],
      );
    });
    return { message: 'Annotation deleted.' };
  }
}
