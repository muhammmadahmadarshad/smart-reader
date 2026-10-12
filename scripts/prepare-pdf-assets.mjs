import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const pdfjs = dirname(require.resolve('pdfjs-dist/package.json'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  const destination = resolve(root, 'apps/web/public/pdfjs', folder);
  mkdirSync(destination, { recursive: true });
  cpSync(resolve(pdfjs, folder), destination, { recursive: true });
}
