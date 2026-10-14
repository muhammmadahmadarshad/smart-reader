import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Book } from './entities/book.entity';
import { ReadingProgress } from '../reading-progress/entities/reading-progress.entity';
import { StorageService } from '../storage/storage.service';
import { ListBooksDto } from './dto/books.dto';
import { inspectPdf, validateUpload } from './pdf-inspector';

@Injectable()
export class BooksService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}
  get maxBytes() {
    return Number(this.config.get('MAX_UPLOAD_MB', '50')) * 1048576;
  }
  private get repo() {
    return this.db.getRepository(Book);
  }
  onModuleInit() {
    this.timer = setInterval(() => void this.cleanup(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async owned(userId: string, id: string, ready = false) {
    const book = await this.repo
      .createQueryBuilder('book')
      .addSelect('book.objectKey')
      .where('book.id = :id AND book.userId = :userId', { id, userId })
      .getOne();
    if (!book) throw new NotFoundException('Book not found.');
    if (ready && book.status !== 'READY')
      throw new ConflictException('This book is not ready to open.');
    return book;
  }
  view(book: Book, progress?: ReadingProgress | null) {
    return {
      id: book.id,
      title: book.title,
      size: book.size,
      pageCount: book.pageCount,
      status: book.status,
      createdAt: book.createdAt,
      lastOpenedAt: book.lastOpenedAt,
      progress: progress ? { page: progress.page, updatedAt: progress.updatedAt } : null,
    };
  }
  async list(userId: string, query: ListBooksDto) {
    const qb = this.repo.createQueryBuilder('book').where('book.userId = :userId', { userId });
    if (query.search.trim())
      qb.andWhere('book.title ILIKE :search', {
        search: `%${query.search.trim().replace(/[\\%_]/g, '\\$&')}%`,
      });
    qb.leftJoinAndMapOne(
      'book.reading',
      ReadingProgress,
      'reading',
      'reading.bookId = book.id AND reading.userId = :userId',
      { userId },
    );
    if (query.sort === 'title')
      qb.addSelect('LOWER(book.title)', 'sort_title').orderBy('sort_title', 'ASC');
    else if (query.sort === 'opened') qb.orderBy('book.lastOpenedAt', 'DESC', 'NULLS LAST');
    else qb.orderBy('book.createdAt', 'DESC');
    qb.addOrderBy('book.id', 'ASC');
    const [books, total] = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    return {
      items: books.map((book) =>
        this.view(book, (book as Book & { reading?: ReadingProgress }).reading),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async get(userId: string, id: string) {
    const book = await this.owned(userId, id);
    const progress = await this.db.getRepository(ReadingProgress).findOneBy({ userId, bookId: id });
    return this.view(book, progress);
  }
  async upload(userId: string, file: Express.Multer.File | undefined) {
    validateUpload(file, this.maxBytes);
    const metadata = await inspectPdf(file.buffer);
    const title =
      file.originalname
        .replace(/\.pdf$/i, '')
        .replace(/[\u0000-\u001f]/g, '')
        .trim()
        .slice(0, 200) || 'Untitled book';
    const book = await this.repo.save(
      this.repo.create({
        userId,
        title,
        size: file.size,
        pageCount: metadata.pages,
        pageBoxes: metadata.boxes,
        objectKey: `${randomUUID()}/${randomUUID()}.pdf`,
        status: 'UPLOADING',
      }),
    );
    try {
      await this.storage.put(book.objectKey, file.buffer);
      await this.repo.update(book.id, { status: 'READY' });
      return this.view({ ...book, status: 'READY' });
    } catch {
      // Keep the key in the database until deletion is confirmed, even if S3 put timed out after accepting it.
      try {
        await this.storage.remove(book.objectKey);
        await this.repo.delete(book.id);
      } catch {
        await this.repo.update(book.id, { status: 'FAILED' }).catch(() => undefined);
      }
      throw new ServiceUnavailableException(
        'Upload failed. Please try again. Any partial upload will be cleaned up.',
      );
    }
  }
  async rename(userId: string, id: string, title: string) {
    await this.owned(userId, id, true);
    await this.repo.update({ id, userId, status: 'READY' }, { title });
    return this.get(userId, id);
  }
  async geometry(book: Book) {
    if (book.pageBoxes) return book.pageBoxes;
    const object = await this.storage.get(book.objectKey);
    const data = await object.Body!.transformToByteArray();
    const metadata = await inspectPdf(Buffer.from(data));
    await this.repo.update(book.id, { pageBoxes: metadata.boxes });
    return metadata.boxes;
  }
  async remove(userId: string, id: string) {
    const book = await this.owned(userId, id);
    await this.repo.update({ id, userId }, { status: 'DELETING' });
    try {
      await this.storage.remove(book.objectKey);
      await this.repo.delete({ id, userId });
    } catch {
      throw new ServiceUnavailableException(
        'Deletion is pending. Retry now or it will be retried automatically.',
      );
    }
    return { message: 'Book deleted.' };
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const stale = await this.repo
        .createQueryBuilder('book')
        .addSelect('book.objectKey')
        .where('book.status != :ready AND book.updatedAt < :cutoff', {
          ready: 'READY',
          cutoff: new Date(Date.now() - 15 * 60000),
        })
        .take(50)
        .getMany();
      for (const book of stale) {
        await this.storage.remove(book.objectKey);
        await this.repo.delete(book.id);
      }
    } catch {
      Logger.warn('Pending storage cleanup will be retried.', 'Books');
    } finally {
      this.cleaning = false;
    }
  }
}
