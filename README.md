# Smart Reader

A private PDF library and reading workspace. React + TypeScript + Vite + Ant Design, NestJS, PostgreSQL with TypeORM migrations, and private S3-compatible storage.

Implemented: email/password authentication and resets; a private, searchable PDF library; and a dedicated PDF.js reader with page navigation, zoom, text selection/search, real document outlines, bookmarks, saved reading position, persistent colored highlights, attached notes and standalone book notes. See [verification and limitations](docs/verification.md).

## Start locally

Requirements: Node.js 24, pnpm 11.13.0, Docker Desktop with Linux containers.

```sh
pnpm install --frozen-lockfile
node scripts/setup-env.mjs
pnpm db:up
pnpm db:migrate
pnpm dev
```

The environment setup generates local passwords and a session secret, preserving existing `.env` files. Alternatively, copy `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example` to their `.env` equivalents and replace the placeholders. Keep database and storage credentials consistent between the root and API configuration.

The initial MinIO image build downloads and compiles its pinned upstream source and may take several minutes; subsequent starts reuse the image.

| Service                         | Address                             |
| ------------------------------- | ----------------------------------- |
| Smart Reader                    | http://localhost:5184               |
| API documentation               | http://localhost:3014/api/docs      |
| OpenAPI JSON                    | http://localhost:3014/api/docs-json |
| Email preview (password resets) | http://localhost:8025               |
| MinIO console                   | http://localhost:9001               |
| PostgreSQL                      | localhost:5433                      |

Register your own account. For password resets, request a link from the login page, open Mailpit, and follow the link. Use `localhost`, matching `APP_ORIGIN`, rather than `127.0.0.1` when opening the web app.

## Repository layout

```text
apps/web/src/
  auth/               Login, registration, reset, route protection
  books/              Personal library and uploads
  reader/             PDF rendering, search, outline, bookmarks and progress
  layout/             Shared application shell
  theme.ts            Shared Ant Design tokens
apps/api/src/
  auth/               Sessions and password resets
  users/              User data
  books/              Uploads and ownership-checked library
  storage/            Private S3 storage
  reading-progress/   Reading position
  bookmarks/          Page bookmarks
  annotations/        Versioned highlights and personal notes
  database/           Connection configuration and migrations
infra/minio/          Reproducible local MinIO container
tests/                Browser workflow tests
```

Entities, DTOs, and feature types live within their owning modules. See [architecture decisions](docs/architecture.md).

## Commands

```sh
pnpm dev                 # Both applications with hot reload
pnpm dev:frontend        # Frontend only
pnpm dev:backend         # API only
pnpm build               # Build both applications
pnpm typecheck           # Check both TypeScript projects
pnpm format:check        # Verify consistent source formatting
pnpm db:migrate          # Apply pending migrations
pnpm db:down             # Stop infrastructure, retaining volumes
```

Create a migration after editing entities:

```sh
pnpm --filter ./apps/api migration:generate src/database/migrations/DescribeChange
pnpm db:migrate
```

Inspect generated migrations before applying them. Never enable schema synchronization in production. `pnpm --filter ./apps/api migration:revert` reverts the most recent migration and can remove data.

## Verification

Start infrastructure and apply migrations first. Tests create uniquely named test users and books; API tests remove their own records. Use a separate database and bucket for CI.

```sh
pnpm exec playwright install chromium
node scripts/generate-fixtures.mjs
pnpm test
pnpm test:ui
```

Generated fixtures live under ignored `artifacts/fixtures`: a multiline text PDF with outline, multicolumn and rotated/mixed-size PDFs, an image-only scanned PDF, a 500-page PDF, and a corrupt PDF. Browser screenshots and traces are written to ignored artifacts/test-result folders. Development servers can remain running while browser tests reuse them.

## Deployment configuration

Serve `apps/web/dist` with SPA fallback and proxy `/api` to NestJS. Run `apps/api/dist/main.js` after building. Set `APP_ORIGIN` to the public HTTPS origin, `COOKIE_SECURE=true`, and `NODE_ENV=production`; supply fresh secrets, SMTP credentials, and a private production S3 bucket. Set `S3_CREATE_BUCKET=false` for a pre-provisioned bucket. Apply migrations as a deployment step, not automatically in application startup.

The default upload maximum is 50 MB (`MAX_UPLOAD_MB`); align the reverse proxy's request-body limit with that setting. Local infrastructure credentials and Mailpit are for development only.

## Reading a book

Open a title in your library. Use the page arrows, enter a page number, or use the left/right arrow keys outside form controls. Choose fit-to-width, fit-to-page, or a zoom level from the toolbar. Open the side panel for bookmarks and text search; an Outline tab appears only when the PDF actually contains one. Search is submitted with Enter or Find; use the match arrows or result rows to navigate.

Drag across PDF text to open the contextual toolbar. Choose Yellow, Sage, Peach, or Rose and save a highlight or attach a plain-text note. **Notes and highlights** opens the searchable, filterable book-wide panel; page references return to the original passage. **New book note** works without a selection, including on scanned pages. Editing uses explicit Save/Cancel, retry feedback, and conflict recovery. Notes are limited to 5,000 characters. Deleting an attached note can keep its highlight.

The single-page reader limits text selections to the current page. Scanned pages have no selectable text without OCR. PDF export, OCR, AI and sharing remain out of scope. Reading position saves after a short pause and is flushed when returning to the library.

See [Phase 4 API, coordinates, migrations and verification](docs/annotations.md). This repository uses TypeORM rather than Prisma; Phase 4 retains its versioned migrations. Existing highlights are migrated without losing their saved positions. Apply migrations before starting the updated API.
