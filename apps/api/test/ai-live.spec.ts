import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AssistantConfig } from '../src/ai/assistant.config';
import { EndpointPolicy } from '../src/ai/endpoint-policy';
import { ConnectionsService, PROVIDER_URLS } from '../src/ai/connections.service';
import { UserModelProvider } from '../src/ai/user-model.provider';
import { ConnectionProvider, AiConnection } from '../src/ai/entities/ai.entities';
// No ambient OPENAI_API_KEY or project credential fallback. Run only with explicit test settings.
const live = process.env.AI_LIVE_TEST === 'I_ACCEPT_PROVIDER_CHARGES' ? it : it.skip;
live(
  'opt-in user LLM protocol smoke test (may incur charges)',
  async () => {
    const provider = process.env.AI_TEST_PROVIDER as ConnectionProvider,
      model = process.env.AI_TEST_MODEL;
    if (!Object.keys(PROVIDER_URLS).includes(provider) || !model)
      throw new Error('Explicit AI_TEST_PROVIDER and AI_TEST_MODEL are required.');
    const baseUrl = PROVIDER_URLS[provider] || process.env.AI_TEST_BASE_URL;
    if (!baseUrl) throw new Error('AI_TEST_BASE_URL is required for custom protocols.');
    const apiKey = process.env.AI_TEST_API_KEY;
    if (!apiKey && !['compatible', 'ollama'].includes(provider))
      throw new Error('An explicit AI_TEST_API_KEY is required.');
    const config = new AssistantConfig(
      new ConfigService({
        AI_ENABLED: 'true',
        AI_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }),
        AI_ALLOWED_PRIVATE_ORIGINS: process.env.AI_TEST_PRIVATE_ORIGINS || '',
      }),
    );
    const connection = {
      id: 'test',
      userId: 'test',
      provider,
      model,
      baseUrl,
      streaming: process.env.AI_TEST_STREAMING === 'true',
      validation: 'UNVALIDATED',
      validatedModels: [],
      revision: 1,
    } as unknown as AiConnection;
    const connections = {
      resolve: async () => ({ connection, apiKey }),
      owned: async () => connection,
      view: () => ({ id: 'test' }),
    } as unknown as ConnectionsService;
    const db = {
      getRepository: () => ({ update: async () => ({ affected: 1 }) }),
    } as unknown as DataSource;
    const policy = new EndpointPolicy(config);
    await policy.resolve(baseUrl);
    await new UserModelProvider(connections, policy, config, db).validate('test', 'test', model);
  },
  120000,
);
