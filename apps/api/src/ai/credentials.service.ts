import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AssistantConfig } from './assistant.config';
@Injectable()
export class CredentialsService {
  constructor(private readonly config: AssistantConfig) {}
  encrypt(userId: string, connectionId: string, key: string) {
    const version = this.config.keyVersion;
    const secret = this.config.keys[version];
    if (!secret)
      throw new ServiceUnavailableException(
        'AI connection storage is not configured by the administrator.',
      );
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(secret, 'base64'), iv);
    cipher.setAAD(Buffer.from(`${userId}:${connectionId}:${version}`));
    const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    return [
      version,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }
  decrypt(userId: string, connectionId: string, encrypted: string) {
    try {
      const [version, iv, tag, data] = encrypted.split('.');
      const key = this.config.keys[version];
      if (!key) throw new Error();
      const cipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'base64'),
        Buffer.from(iv, 'base64'),
      );
      cipher.setAAD(Buffer.from(`${userId}:${connectionId}:${version}`));
      cipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new ServiceUnavailableException(
        'Stored credential cannot be decrypted. Ask the administrator to restore its encryption key version or replace this credential.',
      );
    }
  }
}
