import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, MoreThan, QueryFailedError } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Session } from './entities/session.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { createHmac, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { UsersService } from '../users/users.service';
import { hashPassword, verifyPassword } from './password';
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}
  digest(token: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('SESSION_SECRET'))
      .update(token)
      .digest('hex');
  }
  async signup(email: string, password: string) {
    try {
      return await this.users.create(email, await hashPassword(password));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code: string }).code === '23505'
      )
        throw new ConflictException('An account with this email already exists.');
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    if (!(await verifyPassword(password, hash)) || !user)
      throw new UnauthorizedException('Email or password is incorrect.');
    return user;
  }
  async createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + Number(this.config.get('SESSION_DAYS', '7')) * 86400000,
    );
    await this.db.getRepository(Session).save({ userId, tokenHash: this.digest(token), expiresAt });
    return { token, expiresAt };
  }
  async authenticate(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Please log in to continue.');
    const session = await this.db
      .getRepository(Session)
      .findOne({ where: { tokenHash: this.digest(token) }, relations: { user: true } });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException('Your session has expired. Please log in again.');
    return session;
  }
  async logout(token?: string) {
    if (token) await this.db.getRepository(Session).delete({ tokenHash: this.digest(token) });
  }
  async forgot(email: string) {
    const user = await this.users.findByEmail(email);
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.db.getRepository(PasswordResetToken).save({
        userId: user.id,
        tokenHash: this.digest(token),
        expiresAt: new Date(Date.now() + 30 * 60000),
      });
      const url = `${this.config.getOrThrow('APP_ORIGIN')}/reset-password#token=${token}`;
      const transport = nodemailer.createTransport({
        host: this.config.getOrThrow<string>('SMTP_HOST'),
        port: Number(this.config.get('SMTP_PORT', '1025')),
        secure: this.config.get('SMTP_SECURE') === 'true',
        ...(this.config.get('SMTP_USER')
          ? {
              auth: {
                user: this.config.get<string>('SMTP_USER'),
                pass: this.config.get<string>('SMTP_PASSWORD'),
              },
            }
          : {}),
        connectionTimeout: 5000,
        socketTimeout: 5000,
      });
      try {
        await transport.sendMail({
          from: this.config.getOrThrow<string>('SMTP_FROM'),
          to: user.email,
          subject: 'Reset your Smart Reader password',
          text: `Reset your password using this single-use link, valid for 30 minutes:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
        });
      } catch {
        await this.db.getRepository(PasswordResetToken).delete({ tokenHash: this.digest(token) });
        Logger.error('Password reset email delivery failed. Check SMTP configuration.', 'Auth');
      }
    }
    return { message: 'If an account exists for that email, a password reset link has been sent.' };
  }
  async reset(token: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      const reset = await tx.findOne(PasswordResetToken, {
        where: { tokenHash: this.digest(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!reset || reset.expiresAt <= new Date())
        throw new BadRequestException('This reset link is invalid or expired. Request a new one.');
      const consumed = await tx.delete(PasswordResetToken, {
        id: reset.id,
        expiresAt: MoreThan(new Date()),
      });
      if (consumed.affected !== 1)
        throw new BadRequestException('This reset link has already been used.');
      await tx.update(User, reset.userId, { passwordHash });
      await tx.delete(Session, { userId: reset.userId });
      await tx.delete(PasswordResetToken, { userId: reset.userId });
    });
    return { message: 'Password updated. Log in with your new password.' };
  }
}
