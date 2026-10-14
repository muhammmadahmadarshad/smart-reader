import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/entities/user.entity';
import { Book } from '../src/books/entities/book.entity';
import { BooksService } from '../src/books/books.service';
import { StorageService } from '../src/storage/storage.service';
import { validateUpload } from '../src/books/pdf-inspector';
import { ReadingProgress } from '../src/reading-progress/entities/reading-progress.entity';
import { Bookmark } from '../src/bookmarks/entities/bookmark.entity';
import { Highlight } from '../src/highlights/entities/highlight.entity';
describe('Private library with PostgreSQL and MinIO', () => {
  let app: INestApplication;
  let db: DataSource;
  let books: BooksService;
  let storage: StorageService;
  let owner: string;
  let other: string;
  let cookie: string;
  let otherCookie: string;
  let id: string;
  let key: string;
  const pdf = () => readFileSync(resolve('../../artifacts/fixtures/text.pdf'));
  const req = (
    method: 'get' | 'post' | 'patch' | 'delete' | 'put',
    path: string,
    session = cookie,
  ) =>
    request(app.getHttpServer())
      [method](`/api${path}`)
      .set('Cookie', session)
      .set('Origin', process.env.APP_ORIGIN!)
      .set('X-Kevnex-Request', '1');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    books = app.get(BooksService);
    storage = app.get(StorageService);
    const auth = app.get(AuthService);
    owner = (await auth.signup(`owner-${randomUUID()}@example.com`, 'A strong testing passphrase!'))
      .id;
    other = (await auth.signup(`other-${randomUUID()}@example.com`, 'A strong testing passphrase!'))
      .id;
    cookie = `kevnex_session=${(await auth.createSession(owner)).token}`;
    otherCookie = `kevnex_session=${(await auth.createSession(other)).token}`;
  });
  afterAll(async () => {
    if (owner) {
      for (const book of await db.getRepository(Book).findBy({ userId: owner }))
        await books.remove(owner, book.id);
      await db.getRepository(User).delete(owner);
    }
    if (other) await db.getRepository(User).delete(other);
    await app?.close();
  });
  it('validates extension, MIME type, signature, size, and corrupt documents', async () => {
    const file = {
      originalname: 'book.pdf',
      mimetype: 'application/pdf',
      buffer: pdf(),
      size: pdf().length,
    } as Express.Multer.File;
    expect(() => validateUpload({ ...file, originalname: 'book.exe' }, 50 * 1048576)).toThrow();
    expect(() => validateUpload({ ...file, mimetype: 'text/plain' }, 50 * 1048576)).toThrow();
    expect(() =>
      validateUpload({ ...file, buffer: Buffer.from('not pdf') }, 50 * 1048576),
    ).toThrow();
    expect(() => validateUpload({ ...file, size: 51 * 1048576 }, 50 * 1048576)).toThrow();
    await req('post', '/books')
      .attach('file', Buffer.from('not a PDF'), {
        filename: 'bad.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    await req('post', '/books')
      .attach('file', Buffer.from('%PDF-1.7\nbroken'), {
        filename: 'bad.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });
  it('rejects oversized HTTP uploads before parsing or storing them', async () => {
    await req('post', '/books')
      .attach('file', Buffer.alloc(51 * 1048576), {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    expect(await db.getRepository(Book).countBy({ userId: owner })).toBe(0);
  });
  it('uploads privately and streams authorized byte ranges', async () => {
    const result = await req('post', '/books')
      .attach('file', pdf(), { filename: 'A quiet forest.pdf', contentType: 'application/pdf' })
      .expect(201);
    id = result.body.id;
    expect(result.body.pageCount).toBe(3);
    expect(result.body.status).toBe('READY');
    expect(result.body.objectKey).toBeUndefined();
    key = (await books.owned(owner, id)).objectKey;
    const anonymous = await fetch(`${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`);
    expect(anonymous.status).toBe(403);
    const file = await req('get', `/books/${id}/file`).set('Range', 'bytes=0-4').expect(206);
    expect(file.headers['content-range']).toMatch(/^bytes 0-4\//);
    expect(file.body.toString()).toBe('%PDF-');
    await req('get', `/books/${id}/file`).set('Range', 'bytes=99999999-').expect(416);
  });
  it('prevents cross-user metadata, file, rename, and delete access', async () => {
    for (const path of [`/books/${id}`, `/books/${id}/file`])
      await req('get', path, otherCookie).expect(404);
    await req('patch', `/books/${id}`, otherCookie).send({ title: 'Stolen' }).expect(404);
    await req('delete', `/books/${id}`, otherCookie).expect(404);
    const list = await req('get', '/books', otherCookie).expect(200);
    expect(list.body.total).toBe(0);
    await request(app.getHttpServer()).get(`/api/books/${id}/file`).expect(401);
  });
  it('renames, searches, paginates, and sorts the personal library', async () => {
    await req('patch', `/books/${id}`).send({ title: 'Renamed forest' }).expect(200);
    const list = await req('get', '/books?search=forest&sort=title&pageSize=1').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].title).toBe('Renamed forest');
    expect((await req('get', '/books?search=missing').expect(200)).body.total).toBe(0);
    await req('get', '/books?page=0').expect(400);
  });
  it('persists one bounded reading position and last-opened time per user/book', async () => {
    await req('post', `/books/${id}/open`).expect(201);
    await req('put', `/books/${id}/progress`).send({ page: 2 }).expect(200);
    await req('put', `/books/${id}/progress`).send({ page: 3 }).expect(200);
    const reopened = await req('post', `/books/${id}/open`).expect(201);
    expect(reopened.body.progress.page).toBe(3);
    expect(reopened.body.lastOpenedAt).toBeTruthy();
    expect(await db.getRepository(ReadingProgress).countBy({ userId: owner, bookId: id })).toBe(1);
    for (const page of [0, 4, 1.5])
      await req('put', `/books/${id}/progress`).send({ page }).expect(400);
    await req('put', `/books/${id}/progress`, otherCookie).send({ page: 1 }).expect(404);
    await req('post', `/books/${id}/open`, otherCookie).expect(404);
  });
  it('enforces bookmark ownership, page bounds, uniqueness and rename/delete', async () => {
    const bookmark = (
      await req('post', `/books/${id}/bookmarks`)
        .send({ page: 2, label: 'A useful page' })
        .expect(201)
    ).body;
    await req('post', `/books/${id}/bookmarks`)
      .send({ page: 2, label: 'A useful page' })
      .expect(201);
    expect((await req('get', `/books/${id}/bookmarks`).expect(200)).body).toHaveLength(1);
    await req('post', `/books/${id}/bookmarks`)
      .send({ page: 4, label: 'Out of bounds' })
      .expect(400);
    await req('get', `/books/${id}/bookmarks`, otherCookie).expect(404);
    await req('post', `/books/${id}/bookmarks`, otherCookie)
      .send({ page: 1, label: 'Stolen' })
      .expect(404);
    await req('patch', `/books/${id}/bookmarks/${bookmark.id}`, otherCookie)
      .send({ label: 'Stolen' })
      .expect(404);
    await req('delete', `/books/${id}/bookmarks/${bookmark.id}`, otherCookie).expect(404);
    await req('patch', `/books/${id}/bookmarks/${bookmark.id}`)
      .send({ label: 'Renamed bookmark' })
      .expect(200);
    expect((await req('get', `/books/${id}/bookmarks`).expect(200)).body[0].label).toBe(
      'Renamed bookmark',
    );
    await req('delete', `/books/${id}/bookmarks/${bookmark.id}`).expect(200);
    await req('post', `/books/${id}/bookmarks`)
      .send({ page: 1, label: 'Cascade test' })
      .expect(201);
    await expect(
      db.getRepository(Bookmark).save({ userId: other, bookId: id, page: 1, label: 'Forbidden' }),
    ).rejects.toThrow();
  });
  it('compensates failed uploads and retains retryable records when deletion fails', async () => {
    const put = jest.spyOn(storage, 'put').mockRejectedValueOnce(new Error('storage unavailable'));
    await req('post', '/books')
      .attach('file', pdf(), { filename: 'failed.pdf', contentType: 'application/pdf' })
      .expect(503);
    put.mockRestore();
    expect(await db.getRepository(Book).countBy({ userId: owner })).toBe(1);
    const remove = jest
      .spyOn(storage, 'remove')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    await req('delete', `/books/${id}`).expect(503);
    remove.mockRestore();
    expect((await books.owned(owner, id)).status).toBe('DELETING');
    await req('get', `/books/${id}/file`).expect(409);
    await req('delete', `/books/${id}`).expect(200);
    await req('get', `/books/${id}`).expect(404);
    expect(await db.getRepository(ReadingProgress).countBy({ bookId: id })).toBe(0);
    expect(await db.getRepository(Bookmark).countBy({ bookId: id })).toBe(0);
    expect(await db.getRepository(Highlight).countBy({ bookId: id })).toBe(0);
    await expect(storage.get(key)).rejects.toThrow();
  });
});
