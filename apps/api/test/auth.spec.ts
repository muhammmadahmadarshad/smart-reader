import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/http';
import { AuthService } from '../src/auth/auth.service';
import { User } from '../src/users/entities/user.entity';
import { Session } from '../src/auth/entities/session.entity';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity';
describe('Authentication with PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  let auth: AuthService;
  let cookie: string;
  let userId: string;
  const email = `auth-${randomBytes(6).toString('hex')}@example.com`;
  const password = 'A long original passphrase!';
  const post = (path: string) =>
    request(app.getHttpServer())
      .post(`/api/auth/${path}`)
      .set('Origin', process.env.APP_ORIGIN!)
      .set('X-Kevnex-Request', '1');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    auth = app.get(AuthService);
  });
  afterAll(async () => {
    if (userId) await db.getRepository(User).delete(userId);
    await app?.close();
  });
  it('rejects anonymous access and cross-site mutations', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, password })
      .expect(403);
    await post('signup')
      .set('Origin', 'https://evil.example')
      .send({ email, password })
      .expect(403);
  });
  it('normalizes unique emails and issues an HTTP-only session cookie', async () => {
    const result = await post('signup')
      .send({ email: ` ${email.toUpperCase()} `, password })
      .expect(201);
    userId = result.body.id;
    expect(result.body.email).toBe(email);
    expect(result.body.passwordHash).toBeUndefined();
    const header = result.headers['set-cookie'][0];
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    cookie = header.split(';')[0];
    await post('signup').send({ email, password }).expect(409);
    const user = await db
      .getRepository(User)
      .findOneOrFail({ where: { id: userId }, select: { passwordHash: true } });
    expect(user.passwordHash).not.toContain(password);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(200);
  });
  it('invalidates sessions on logout and enforces expiry', async () => {
    await post('logout').set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    const login = await post('login').send({ email, password }).expect(200);
    cookie = login.headers['set-cookie'][0].split(';')[0];
    await db.getRepository(Session).update({ userId }, { expiresAt: new Date(Date.now() - 1000) });
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await post('login').send({ email, password: 'incorrect password' }).expect(401);
  });
  it('rejects expired reset tokens; consumes valid tokens once and revokes sessions', async () => {
    const token = randomBytes(32).toString('hex');
    await db
      .getRepository(PasswordResetToken)
      .save({ userId, tokenHash: auth.digest(token), expiresAt: new Date(Date.now() - 1000) });
    await post('reset-password').send({ token, password }).expect(400);
    await db
      .getRepository(PasswordResetToken)
      .update({ tokenHash: auth.digest(token) }, { expiresAt: new Date(Date.now() + 60000) });
    const active = await auth.createSession(userId);
    const newPassword = 'A different secure passphrase!';
    await post('reset-password').send({ token, password: newPassword }).expect(200);
    await post('reset-password').send({ token, password: newPassword }).expect(400);
    await expect(auth.authenticate(active.token)).rejects.toThrow();
    await post('login').send({ email, password: newPassword }).expect(200);
    expect(await db.getRepository(PasswordResetToken).countBy({ userId })).toBe(0);
  });
  it('uses a generic forgot response and delivers a working link to local mail', async () => {
    const known = await post('forgot-password').send({ email }).expect(200);
    const unknown = await post('forgot-password')
      .send({ email: `unknown-${email}` })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    const mailbox = (await fetch('http://localhost:8025/api/v1/messages').then((r) =>
      r.json(),
    )) as { messages: { ID: string; To: { Address: string }[] }[] };
    const message = mailbox.messages.find((m) => m.To.some((to) => to.Address === email));
    expect(message).toBeDefined();
    const detail = (await fetch(`http://localhost:8025/api/v1/message/${message!.ID}`).then((r) =>
      r.json(),
    )) as { Text: string };
    const token = detail.Text.match(/token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeDefined();
    await post('reset-password').send({ token, password }).expect(200);
  });
  it('validates input and rate limits repeated login attempts', async () => {
    await post('signup').send({ email: 'not-email', password: 'short' }).expect(400);
    let status = 0;
    for (let i = 0; i < 14; i++)
      status = (await post('login').send({ email, password: 'wrong password!' })).status;
    expect(status).toBe(429);
  });
});
