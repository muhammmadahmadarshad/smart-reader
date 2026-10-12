# Delivery report

## Completed

1. **Foundation and authentication**: responsive Ant Design branding/forms and application shell; normalized email signup; scrypt password hashing; database-backed HTTP-only cookie sessions; login/logout/current-user routes; protected routes and APIs; CSRF origin/header checks; validation and throttling; hashed, expiring, single-use reset tokens; Mailpit reset email preview.
2. **Personal library**: upload progress; configurable 50 MB default limit; extension/MIME/signature/parser validation; private MinIO storage; generated object keys; authorized range streaming; per-user grid/list, search, sorting and pagination; rename/delete; explicit pending/failure states; compensation and retryable object cleanup.
3. **Reader**: dedicated PDF.js route; one-page rendering; previous/next/direct navigation; zoom and fitting modes; selectable text layer; progressive, cancellable text search and match navigation; genuine document outlines; persistent page bookmarks with rename/delete; debounced, serialized position saves and restoration; library progress/last-opened updates; responsive controls and side panels; isolated future selection-action hook.

The final ORM is **TypeORM**, per the revised requirement. Entities, DTOs and types are colocated within their feature modules. PostgreSQL is on host port **5433**. The initial versioned migration creates all six entities, ownership indexes, uniqueness constraints, and cascading foreign keys. The pnpm lockfile pins resolved dependencies.

## Checks

Original three-phase verification: **14 backend integration tests and 4 browser workflows passed**, along with both production builds and a frozen-lockfile install. PostgreSQL, MinIO, Mailpit, and both development servers were left running.

The requested highlighting extension adds a second TypeORM migration and persistent yellow text highlights. All **15 backend integration tests** pass, including geometry validation, page bounds, cross-user list/create/delete denial, authentication and cascade deletion. The reader browser workflow now uses real mouse dragging and checks highlight creation, restoration after reload, scaling with zoom, side-panel display and deletion. Scanned and 500-page document checks remain in place.

- TypeScript checks and production builds for both applications.
- Backend integration tests against real PostgreSQL and MinIO: authentication, uniqueness, cookie attributes, CSRF rejection, session logout/expiration, reset expiration/single use/session revocation, Mailpit delivery, rate limits, upload validation, private storage, range requests, cross-user access prevention, search/rename/pagination, storage compensation/retry, bounded reading progress, bookmark ownership, and cascading reading-data deletion.
- Playwright browser workflows: signup/refresh/logout/protection and reset email link; library upload/grid/list/search/rename/delete; PDF selection/navigation/zoom/outline/search; bookmark rename/remove/persistence; reading-position restoration; mobile navigation.
- Generated text PDF (3 pages with outline), image-only scanned PDF, and 500-page document exercised through the browser. Confirmed a single rendered page, progressive search cancellation, and navigation to page 500.
- Visual inspection of authentication, library and reader screenshots at desktop and 390px mobile width. PDF canvas content remains its original color. Main/secondary text and primary-button colors meet WCAG AA normal-text contrast on their intended surfaces.
- Source formatting and frozen-lockfile installation checks.

Measured contrast ratios: main text on card surfaces **13.77:1**, secondary text on card surfaces **5.64:1**, white text on primary buttons **6.73:1**, and secondary text on the reading background **5.35:1**.

Screenshots are under ignored `artifacts/`; reproducible fixture generation and test commands are in the README.

## Limits and deliberate scope boundaries

- Saved text highlights are implemented as a requested scope extension. The side panel lists the current page's highlights. Notes, color selection, embedding/exporting highlights into the PDF, OCR, AI, sharing, payments and administration are not implemented.
- Scanned pages can be viewed and bookmarked but cannot be text-searched without OCR. Password-protected files are rejected with an unlock-copy message. PDFs that fail the metadata parser must be repaired or replaced before upload.
- Search is case-insensitive plain text and limited to 1,000 displayed matches. It does not perform OCR, fuzzy matching, or cross-page phrase matching. PDF text extraction quality depends on the document’s encoding and reading order.
- The viewer is a single-page reader, not continuous scrolling. Fonts, character maps and PDF worker assets are served locally.
- Progress writes on page hiding are best effort; offline or abruptly terminated browsers can lose the most recent unsaved change. Explicit return-to-library waits for the latest save and surfaces failures.
- Local MinIO is built from a pinned upstream source release because the original public container registries were unavailable. The first build is slower. Production should use a maintained private S3 service with dedicated least-privilege credentials, HTTPS, configured SMTP and backups.
- Rate limiting is in-memory for a single API instance. Expired session/reset rows are rejected during authentication but are not automatically pruned; operational cleanup is needed for long-running deployments.
- Browser verification was performed with Chromium on Windows. Other browsers and assistive technologies have not been exhaustively tested. PDF.js and Ant Design produce substantial bundles; the reader is lazy-loaded, but Vite reports bundle-size advisories.
