# Smart Reader implementation decisions

- Phase 6 uses project-owned OpenAI embeddings, user-owned encrypted LLM connections, LangChain adapters and explicit LangGraph workflows. PostgreSQL holds durable indexing leases, versioned chunks/vectors, conversations and atomic usage reservations. Exact pgvector retrieval applies owner/book/version/configuration filters in SQL. See [AI architecture and security](ai-assistant.md).

- Phase 4 annotations own versioned highlights and personal notes. New geometry uses PDF coordinates and immutable uploaded-book references; old normalized highlights are migrated read-compatibly. See [annotation coordinates, API and reliability](annotations.md).

- One NestJS API and one React SPA in a pnpm workspace. There are no microservices.
- Each backend feature owns its `entities`, `dto`, and `types` directories. TypeORM connection configuration and versioned migrations live under `database`. `synchronize` is disabled.
- PostgreSQL is exposed on host port **5433**, as requested. Composite foreign keys prevent reading data from referring to a book owned by another user.
- Authentication uses random opaque session tokens; only HMAC hashes are stored in PostgreSQL. Passwords use salted scrypt. Sessions expire after seven days by default and are revoked on logout and password reset.
- Cookies are HTTP-only, host-only, SameSite=Lax, and scoped to `/api`. Local HTTP uses `COOKIE_SECURE=false`; production startup requires `COOKIE_SECURE=true`. The application assumes one public origin with `/api` reverse-proxied to NestJS.
- Every mutation checks the configured Origin and a custom request header; cross-origin forms cannot send this header. The API does not enable cross-origin credential sharing. Password reset links use a URL fragment so tokens are not sent in HTTP request URLs or referrers.
- Rate limits are in-process, appropriate to this single-instance application. A shared throttling store would be necessary before running multiple API replicas.
- PDF metadata is parsed in a resource-limited worker with a timeout. Uploaded files must match extension, MIME type, signature, and the configured size limit. PDF.js is used for browser rendering.
- S3 object keys are random and never derived from filenames. The bucket is private. Authenticated API streaming supports HTTP byte ranges and verifies ownership for every request.
- A database record is created before an object upload. Failed upload compensation and pending deletions retain that record until object removal succeeds. A periodic cleanup retries stale non-ready records after 15 minutes. Reading data is removed by database cascades after the object is deleted.
- Local MinIO is built from the pinned upstream `RELEASE.2025-10-15T17-29-55Z` source because its original public images could not be pulled. This development container is bound to loopback and is not a production storage deployment.
- Ant Design theme tokens are centralized in `apps/web/src/theme.ts`. Original PDF pixels are never tinted by the reading-area background.
- The PDF worker, character maps, fonts and WebAssembly assets are bundled or copied locally; the reader does not fetch PDF assets from a third-party CDN. React-PDF owns document loading-task destruction on unmount. Search cancels through a generation token, discards stale results, and retains only bounded match snippets rather than every page's text.
- Reading progress is debounced by 600 ms and requests are serialized. Explicit library navigation waits for the latest save; page hiding/unmount also attempts a small keepalive request. An offline or abruptly terminated browser cannot guarantee delivery, and save failures are visible with a retry action.

References: [NestJS authentication](https://docs.nestjs.com/security/authentication), [Ant Design theme configuration](https://ant.design/docs/react/customize-theme/), [React-PDF](https://github.com/wojtekmaj/react-pdf), [pinned MinIO source](https://github.com/minio/minio/tree/RELEASE.2025-10-15T17-29-55Z).
