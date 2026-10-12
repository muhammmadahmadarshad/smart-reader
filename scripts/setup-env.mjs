import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// Creates local configuration without ever replacing an existing file.
const db = randomBytes(20).toString('hex');
const storage = randomBytes(20).toString('hex');
const replacements = {
  'replace-with-local-database-password': db,
  'replace-with-local-storage-password': storage,
  'replace-with-at-least-32-random-characters': randomBytes(32).toString('hex'),
};
const rootExists = existsSync('.env');
if (rootExists && !existsSync('apps/api/.env')) {
  const env = readFileSync('.env', 'utf8');
  replacements['replace-with-local-database-password'] =
    env.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim() || db;
  replacements['replace-with-local-storage-password'] =
    env.match(/^S3_SECRET_KEY=(.+)$/m)?.[1]?.trim() || storage;
}
for (const path of ['.env', 'apps/api/.env', 'apps/web/.env']) {
  if (existsSync(path)) {
    console.log(`Preserved ${path}`);
    continue;
  }
  let text = readFileSync(`${path}.example`, 'utf8');
  for (const [from, to] of Object.entries(replacements)) text = text.replaceAll(from, to);
  writeFileSync(path, text);
  console.log(`Created ${path}`);
}
