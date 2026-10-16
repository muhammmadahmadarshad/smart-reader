import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AiConnection, AiPreference, ConnectionProvider } from './entities/ai.entities';
import { CredentialsService } from './credentials.service';
import { EndpointPolicy } from './endpoint-policy';
import { AssistantConfig } from './assistant.config';
export type ConnectionInput = {
  name: string;
  provider: ConnectionProvider;
  baseUrl?: string;
  model: string;
  apiKey?: string;
  streaming?: boolean;
};
export const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  ollama: '',
  compatible: '',
};
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly db: DataSource,
    private readonly credentials: CredentialsService,
    private readonly endpoints: EndpointPolicy,
    private readonly config: AssistantConfig,
  ) {}
  view(c: AiConnection) {
    const {
      id,
      name,
      provider,
      baseUrl,
      model,
      keySuffix,
      validation,
      validatedAt,
      validatedModels,
      streaming,
      revision,
    } = c;
    return {
      id,
      name,
      provider,
      baseUrl,
      model,
      keySuffix,
      validation,
      validatedAt,
      validatedModels,
      streaming,
      revision,
    };
  }
  async list(userId: string) {
    return (
      await this.db
        .getRepository(AiConnection)
        .find({ where: { userId }, order: { createdAt: 'ASC' } })
    ).map((c) => this.view(c));
  }
  async owned(userId: string, id: string, secret = false) {
    const qb = this.db
      .getRepository(AiConnection)
      .createQueryBuilder('c')
      .where('c.id=:id AND c.userId=:userId', { id, userId });
    if (secret) qb.addSelect('c.encryptedKey');
    const c = await qb.getOne();
    if (!c) throw new NotFoundException('AI connection not found.');
    return c;
  }
  async save(userId: string, input: ConnectionInput, id?: string) {
    if (!this.config.connectionsEnabled)
      throw new ServiceUnavailableException(
        'AI connection storage is not configured. Ask the administrator to configure encryption.',
      );
    const old = id ? await this.owned(userId, id, true) : undefined;
    if (!old && (await this.db.getRepository(AiConnection).countBy({ userId })) >= 10)
      throw new BadRequestException('At most 10 connections are supported.');
    const connectionId = old?.id ?? randomUUID();
    const baseUrl = PROVIDER_URLS[input.provider] || input.baseUrl?.replace(/\/$/, '');
    if (!baseUrl) throw new BadRequestException('A base URL is required.');
    if (PROVIDER_URLS[input.provider] && input.baseUrl && input.baseUrl !== baseUrl)
      throw new BadRequestException(
        'Use the OpenAI-compatible connection type for custom hosted endpoints.',
      );
    await this.endpoints.resolve(baseUrl);
    const key = input.apiKey;
    const encryptedKey =
      key !== undefined
        ? key
          ? this.credentials.encrypt(userId, connectionId, key)
          : null
        : (old?.encryptedKey ?? null);
    if (['openai', 'anthropic', 'gemini'].includes(input.provider) && !encryptedKey)
      throw new BadRequestException('This provider requires your API key.');
    if (old && (old.provider !== input.provider || old.baseUrl !== baseUrl) && key === undefined)
      throw new BadRequestException(
        'Replace or clear the key explicitly when changing provider or endpoint.',
      );
    const connection = await this.db.getRepository(AiConnection).save({
      id: connectionId,
      userId,
      name: input.name.trim(),
      provider: input.provider,
      model: input.model.trim(),
      baseUrl,
      encryptedKey,
      keySuffix:
        key !== undefined ? (key.length > 4 ? key.slice(-4) : null) : (old?.keySuffix ?? null),
      validation: 'UNVALIDATED',
      validatedModels: [],
      validatedAt: null,
      streaming: input.streaming ?? old?.streaming ?? input.provider !== 'compatible',
      revision: (old?.revision ?? 0) + 1,
    });
    return this.view(connection);
  }
  async resolve(userId: string, id: string) {
    const connection = await this.owned(userId, id, true);
    return {
      connection,
      apiKey: connection.encryptedKey
        ? this.credentials.decrypt(userId, id, connection.encryptedKey)
        : undefined,
    };
  }
  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.db.transaction(async (m) => {
      await m.query(
        `UPDATE ai_messages SET status='CANCELLED', error='Connection removed' WHERE "userId"=$1 AND "connectionId"=$2 AND status='PENDING'`,
        [userId, id],
      );
      await m.getRepository(AiConnection).delete({ id, userId });
    });
    return { message: 'Connection removed. This does not revoke the key at the provider.' };
  }
  async preference(userId: string, value?: { connectionId: string; model: string }) {
    const repo = this.db.getRepository(AiPreference);
    if (value) {
      await this.owned(userId, value.connectionId);
      await repo.upsert({ userId, ...value }, ['userId']);
    }
    const item = await repo.findOneBy({ userId });
    return { connectionId: item?.connectionId ?? null, model: item?.model ?? null };
  }
}
