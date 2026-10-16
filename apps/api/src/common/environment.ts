import { readAiConfig } from '../ai/ai.config';
import { AssistantConfig } from '../ai/assistant.config';
import { ConfigService } from '@nestjs/config';
export function validateEnvironment(env: Record<string, unknown>) {
  readAiConfig(env);
  new AssistantConfig(new ConfigService(env));
  const required = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'APP_ORIGIN',
    'SMTP_HOST',
    'SMTP_FROM',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
  ];
  for (const name of required)
    if (typeof env[name] !== 'string' || !env[name]) throw new Error(`${name} is required`);
  if (String(env.SESSION_SECRET).length < 32 || String(env.SESSION_SECRET).startsWith('replace-'))
    throw new Error('SESSION_SECRET must be a generated secret of at least 32 characters');
  for (const [name, defaultValue, max] of [
    ['MAX_UPLOAD_MB', 50, 500],
    ['SESSION_DAYS', 7, 30],
    ['PORT', 3014, 65535],
    ['SMTP_PORT', 1025, 65535],
  ] as const) {
    const value = Number(env[name] ?? defaultValue);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  const origin = new URL(String(env.APP_ORIGIN));
  if (origin.origin !== env.APP_ORIGIN || !['http:', 'https:'].includes(origin.protocol))
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a trailing slash');
  if (
    env.NODE_ENV === 'production' &&
    (env.COOKIE_SECURE !== 'true' || origin.protocol !== 'https:')
  )
    throw new Error('Production requires HTTPS and COOKIE_SECURE=true');
  return env;
}
