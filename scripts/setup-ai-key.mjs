import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
// Add encryption to an existing local installation without changing other configuration.
// This never installs AI provider credentials, rotates an existing key or prints secrets.
const path = new URL('../apps/api/.env', import.meta.url);
let env = readFileSync(path, 'utf8');
const line = env.match(/^AI_ENCRYPTION_KEYS=(.*)$/m);
if (line && !['', '{}'].includes(line[1].trim())) {
  console.log('Preserved existing AI encryption keys.');
} else {
  const setting = `AI_ENCRYPTION_KEYS=${JSON.stringify({ v1: randomBytes(32).toString('base64') })}`;
  env = line ? env.replace(/^AI_ENCRYPTION_KEYS=.*$/m, setting) : env + '\n' + setting + '\n';
  writeFileSync(path, env, { mode: 0o600 });
  console.log(
    'Configured local AI credential encryption. Restart the API. Back up the ignored .env securely.',
  );
}
