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
import { BooksService } from '../src/books/books.service';
import { Annotation } from '../src/annotations/entities/annotation.entity';
import { ReadingContextService } from '../src/ai/reading-context.service';
describe('Annotations: PostgreSQL authorization, validation and concurrency', () => {
  let app: INestApplication, db: DataSource, books: BooksService;
  let owner: string,
    other: string,
    cookie: string,
    otherCookie: string,
    book: string,
    second: string,
    id: string;
  const req = (method: 'get' | 'post' | 'patch' | 'delete', path: string, session = cookie) =>
    request(app.getHttpServer())
      [method](`/api${path}`)
      .set('Cookie', session)
      .set('Origin', process.env.APP_ORIGIN!)
      .set('X-Kevnex-Request', '1');
  const path = () => `/books/${book}/annotations`;
  const highlight = () => ({
    clientRequestId: randomUUID(),
    kind: 'HIGHLIGHT',
    selectedText: 'A quiet forest',
    color: '#F5E6A8',
    documentVersion: book,
    coordinateVersion: 2,
    segments: [
      {
        page: 1,
        rectangles: [
          { x: 55, y: 740, width: 250, height: 24 },
          { x: 55, y: 700, width: 300, height: 12 },
        ],
      },
    ],
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    books = app.get(BooksService);
    const auth = app.get(AuthService);
    owner = (
      await auth.signup(`annotations-${randomUUID()}@example.com`, 'A strong testing passphrase!')
    ).id;
    other = (
      await auth.signup(
        `other-annotations-${randomUUID()}@example.com`,
        'A strong testing passphrase!',
      )
    ).id;
    cookie = `kevnex_session=${(await auth.createSession(owner)).token}`;
    otherCookie = `kevnex_session=${(await auth.createSession(other)).token}`;
    const buffer = readFileSync(resolve('../../artifacts/fixtures/text.pdf'));
    const file = {
      originalname: 'annotations.pdf',
      mimetype: 'application/pdf',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;
    book = (await books.upload(owner, file)).id;
    second = (await books.upload(owner, file)).id;
  });
  afterAll(async () => {
    if (book) await books.remove(owner, book);
    if (second) await books.remove(owner, second);
    if (owner) await db.getRepository(User).delete(owner);
    if (other) await db.getRepository(User).delete(other);
    await app?.close();
  });
  it('persists multiline geometry and returns one annotation for concurrent retries', async () => {
    const payload = highlight();
    const responses = await Promise.all([
      req('post', path()).send(payload),
      req('post', path()).send(payload),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    id = responses[0].body.id;
    expect((await req('get', `${path()}/${id}`).expect(200)).body).toMatchObject({
      selectedText: payload.selectedText,
      segments: payload.segments,
      coordinateVersion: 2,
      version: 1,
    });
    await req('post', path())
      .send({ ...payload, selectedText: 'Different operation' })
      .expect(409);
    expect(await db.getRepository(Annotation).countBy({ bookId: book })).toBe(1);
  });
  it('checks session, book owner, annotation owner and route book on every operation', async () => {
    await request(app.getHttpServer()).get(`/api${path()}`).expect(401);
    for (const method of ['get', 'post'] as const)
      await req(method, path(), otherCookie)
        .send(method === 'post' ? highlight() : undefined)
        .expect(404);
    for (const method of ['get', 'patch', 'delete'] as const) {
      await req(method, `${path()}/${id}`, otherCookie)
        .send(method === 'get' ? undefined : { version: 1 })
        .expect(404);
      await req(method, `/books/${second}/annotations/${id}`)
        .send(method === 'get' ? undefined : { version: 1 })
        .expect(404);
    }
    await req('post', path())
      .send({ ...highlight(), userId: other })
      .expect(400);
    await expect(
      db.getRepository(Annotation).save({
        ...highlight(),
        userId: other,
        bookId: book,
        requestHash: 'test',
        firstPage: 1,
      } as Partial<Annotation>),
    ).rejects.toThrow();
  });
  it('prepares context using real owner-scoped repositories and exposes only authenticated disabled capabilities', async () => {
    const builder = app.get(ReadingContextService);
    const input = {
      bookId: book,
      documentVersion: book,
      selectedText: highlight().selectedText,
      pages: { first: 1, last: 1 },
      annotationId: id,
      action: 'EXPLAIN' as const,
      language: 'ur',
    };
    const context = await builder.prepare(owner, input);
    expect(context.bookExcerpts[0]).toMatchObject({
      verifiedDocumentText: false,
      source: { bookId: book, annotationId: id, sourceTitle: 'annotations' },
    });
    await expect(builder.prepare(other, input)).rejects.toThrow('Book not found');
    await expect(
      builder.prepare(owner, { ...input, bookId: second, documentVersion: second }),
    ).rejects.toThrow('Annotation not found');
    await request(app.getHttpServer()).get('/api/ai/capabilities').expect(401);
    expect((await req('get', '/ai/capabilities').expect(200)).body).toMatchObject({
      generation: false,
      streaming: false,
      embeddings: false,
      retrieval: false,
      reason: expect.any(String),
    });
    for (const route of ['/ai/generate', '/ai/retrieve', '/ai/index'])
      await req('post', route).send({}).expect(404);
    expect(await db.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).toEqual([
      { extversion: expect.any(String) },
    ]);
  });
  it('rejects malformed, excessive, nonfinite and out-of-page geometry and text', async () => {
    const valid = highlight();
    for (const invalid of [
      { ...valid, selectedText: ' ' },
      { ...valid, noteText: 'invalid\u0000text' },
      { ...valid, selectedText: 'a'.repeat(10001) },
      { ...valid, noteText: 'a'.repeat(5001) },
      { ...valid, color: '#ffffff' },
      { ...valid, documentVersion: second },
      { ...valid, coordinateVersion: 1 },
      { ...valid, segments: [] },
      { ...valid, segments: Array(21).fill(valid.segments[0]) },
      ...[0, 4, 1.5].map((page) => ({ ...valid, segments: [{ ...valid.segments[0], page }] })),
      ...[null, 'Infinity', -1, 600].map((x) => ({
        ...valid,
        segments: [{ page: 1, rectangles: [{ x, y: 0, width: 20, height: 10 }] }],
      })),
      { ...valid, segments: [{ page: 1, rectangles: [{ x: 10, y: 10, width: 0, height: 10 }] }] },
      {
        ...valid,
        segments: [{ page: 1, rectangles: Array(501).fill(valid.segments[0].rectangles[0]) }],
      },
      { clientRequestId: randomUUID(), kind: 'NOTE', noteText: ' ' },
      { clientRequestId: randomUUID(), kind: 'NOTE', noteText: 'Note', segments: valid.segments },
      { clientRequestId: randomUUID(), kind: 'NOTE', noteText: 'Note', color: '#F5E6A8' },
    ])
      await req('post', path()).send(invalid).expect(400);
    await req('post', path())
      .send({ ...valid, selectedText: 'a'.repeat(200000) })
      .expect(413);
    await req('get', `${path()}?documentPage=4`).expect(400);
    await req('get', `${path()}?pageSize=101`).expect(400);
  });
  it('detects competing updates atomically and rejects stale deletion', async () => {
    const results = await Promise.all([
      req('patch', `${path()}/${id}`).send({ version: 1, noteText: 'first draft' }),
      req('patch', `${path()}/${id}`).send({ version: 1, noteText: 'second draft' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await req('delete', `${path()}/${id}`).send({ version: 1 }).expect(409);
    await req('patch', `${path()}/${id}`)
      .send({ version: 2, color: '#CFE3C6', noteText: 'Forest attached note' })
      .expect(200);
    await req('patch', `${path()}/${id}`).send({ version: 3, color: null }).expect(400);
    await req('patch', `${path()}/${id}`).send({ noteText: 'No version' }).expect(400);
    await req('patch', `${path()}/${id}`).send({ version: 2147483648 }).expect(400);
  });
  it('searches text/notes, filters colors, includes attached notes and paginates', async () => {
    await req('post', path())
      .send({ clientRequestId: randomUUID(), kind: 'NOTE', noteText: 'Standalone forest note' })
      .expect(201);
    expect((await req('get', `${path()}?filter=notes`).expect(200)).body.total).toBe(2);
    expect((await req('get', `${path()}?filter=highlights`).expect(200)).body.total).toBe(1);
    expect((await req('get', `${path()}?search=forest`).expect(200)).body.total).toBe(2);
    expect((await req('get', `${path()}?search=quiet`).expect(200)).body.total).toBe(1);
    expect((await req('get', `${path()}?search=%25`).expect(200)).body.total).toBe(0);
    expect((await req('get', `${path()}?color=%23CFE3C6`).expect(200)).body.total).toBe(1);
    expect((await req('get', `${path()}?documentPage=2`).expect(200)).body.total).toBe(0);
    const list = (await req('get', `${path()}?pageSize=1&sort=page`).expect(200)).body;
    expect(list.items[0].id).toBe(id);
    expect(list.total).toBe(2);
    expect((await req('get', `${path()}?pageSize=1&page=2`).expect(200)).body.items[0].kind).toBe(
      'NOTE',
    );
    expect((await req('get', `${path()}?sort=updated`).expect(200)).body.items[0].kind).toBe(
      'NOTE',
    );
  });
  it('removes attached notes without highlights and prevents retry resurrection after deletion', async () => {
    await req('patch', `${path()}/${id}`).send({ version: 3, noteText: '' }).expect(200);
    expect((await req('get', `${path()}/${id}`).expect(200)).body.noteText).toBeNull();
    const payload = { clientRequestId: randomUUID(), kind: 'NOTE', noteText: 'delete me' };
    const note = (await req('post', path()).send(payload).expect(201)).body;
    await req('patch', `${path()}/${note.id}`).send({ version: 1, noteText: '' }).expect(400);
    await req('patch', `${path()}/${note.id}`)
      .send({ version: 1, noteText: 'edited standalone' })
      .expect(200);
    await req('delete', `${path()}/${note.id}`).send({ version: 2 }).expect(200);
    expect(await db.getRepository(Annotation).findOneBy({ id: note.id })).toMatchObject({
      deleted: true,
      noteText: null,
      selectedText: null,
      segments: null,
    });
    await req('get', `${path()}/${note.id}`).expect(404);
    await req('post', path()).send(payload).expect(409);
    const linked = await req('post', `/books/${second}/annotations`)
      .send({ clientRequestId: randomUUID(), kind: 'NOTE', noteText: 'Cascade me' })
      .expect(201);
    expect(await db.getRepository(Annotation).countBy({ id: linked.body.id })).toBe(1);
    await books.remove(owner, second);
    expect(await db.getRepository(Annotation).countBy({ bookId: second })).toBe(0);
    second = '';
  });
});
