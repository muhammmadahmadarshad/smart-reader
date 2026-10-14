# Phase 4: Highlights and notes

Select PDF text to open an Ant Design popover, choose Yellow, Sage, Peach or Rose, then highlight or add a personal note. Click a saved passage to edit its color/note. If highlights overlap, choose which one to open. The overlay does not intercept dragging or alter the PDF. Scanned pages support **New book note**; highlighting requires a usable text layer.

**Notes and highlights** opens a book-wide panel (a Drawer on small screens). All/Highlights/Notes, literal case-insensitive search, color filters, page/recent sorting and 20-item pagination work together. Notes includes both standalone notes and highlights with an attached note. Click a page reference to render, scroll to and briefly emphasize its passage. Standalone notes have no page reference.

## Coordinates and document identity

New highlights use `coordinateVersion: 2`. Each segment has a one-based PDF page number and individual text-run rectangles `{x,y,width,height}` in **unrotated PDF user space**. X/y identify the minimum coordinates of the rectangle; PDF coordinates usually have a bottom-left origin, but nonzero/negative page-box origins are retained. Units are PDF user units (normally 1/72 inch), not screen pixels.

Selection walks the text nodes intersecting the browser Range and collects their individual client rectangles. It converts their corners with PDF.js `PageViewport.convertToPdfPoint`; it never persists the selection's enclosing DOM rectangle. Rendering uses `convertToViewportRectangle` for the mounted page, including its intrinsic rotation, page dimensions, crop box and user unit. Percentages derived from that viewport are only a rendering convenience, never the saved source of truth. This preserves position through zoom, fit modes, resizing, side-panel changes and page remounts. Search highlights remain independent.

`documentVersion` is the immutable uploaded book UUID. There is no replace-file endpoint: each upload creates a new book ID and unique private object key. Renaming a title does not replace its bytes. The server rejects coordinates referencing another book, even when the bytes happen to be identical. A future replacement feature must create a new document version and must not overwrite these objects in place.

The server extracts page-box bounds during upload in the existing resource-limited PDF worker. For pre-Phase-4 books, bounds are inspected from the owned private object and cached on first new highlight. Rectangle bounds are checked against the intersection of CropBox and MediaBox, with a 0.01-unit rounding tolerance. The API supports up to 20 distinct page segments. The current single-page reader explicitly restricts selection to one mounted page and rejects ranges with either endpoint outside that page.

Migration `1791900000000` copies existing highlights, retaining their IDs and normalized geometry as coordinate schema **1**. Schema 1 is read-compatible only; new API requests require schema 2. Existing normalized rectangles are relative to the original document's displayed page, so they continue to scale with the fixed intrinsic rotation. The old `/highlights` handlers are retired; the archived table remains for migration history, and its matching row is removed when an imported annotation is deleted.

## API

Swagger: `/api/docs`; OpenAPI: `/api/docs-json`, under **Annotations**. Session cookie authentication is required for every operation. Mutations also use the existing `Origin` and `X-Kevnex-Request: 1` protections. Ownership comes from the session; client ownership fields are rejected. Foreign keys enforce user/book ownership and cascade when the book is deleted.

| Method | Path                                 | Result                                                |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| POST   | `/api/books/:bookId/annotations`     | Create or return an idempotent retry (201)            |
| GET    | `/api/books/:bookId/annotations`     | `{items,total,page,pageSize}`                         |
| GET    | `/api/books/:bookId/annotations/:id` | Annotation details                                    |
| PATCH  | `/api/books/:bookId/annotations/:id` | Update note/color with version check                  |
| DELETE | `/api/books/:bookId/annotations/:id` | Delete with version check; also removes attached note |

Example highlight request (replace both UUIDs):

```json
{
  "clientRequestId": "21774a4e-c035-4965-8a66-985ee1686026",
  "kind": "HIGHLIGHT",
  "selectedText": "A quiet forest",
  "noteText": "Return to this passage.",
  "color": "#CFE3C6",
  "documentVersion": "39b891ba-7b29-43ea-a795-726c90232cfa",
  "coordinateVersion": 2,
  "segments": [{ "page": 1, "rectangles": [{ "x": 55, "y": 700, "width": 160, "height": 16 }] }]
}
```

A standalone note sends only `clientRequestId`, `kind: "NOTE"`, and a nonempty `noteText`. It must not carry selection geometry or color. Responses include `id`, `bookId`, `kind`, nullable `selectedText`, `noteText`, `color`, `documentVersion`, `coordinateVersion`, `segments`, `firstPage`, `version`, `createdAt` and `updatedAt`.

PATCH sends `{"version":1,"noteText":"Updated text","color":"#ECCBD3"}`. Omit unchanged fields. Null/empty note text removes an attached note without deleting its highlight; standalone notes must remain nonempty. Color may change only for highlights. DELETE sends a JSON body `{"version":2}`. Selection text and geometry are immutable after creation.

List parameters:

| Parameter      | Values/default                                                           |
| -------------- | ------------------------------------------------------------------------ |
| `filter`       | `all` (default), `highlights`, `notes`                                   |
| `search`       | Up to 200 characters; literal case-insensitive selected-text/note search |
| `color`        | One supported hex color; URL-encode the `#`                              |
| `sort`         | `page` (default, standalone notes last), `updated` (newest first)        |
| `documentPage` | Optional one-based PDF page; distinct from result pagination             |
| `page`         | Result page, starting at 1                                               |
| `pageSize`     | 1–100, default 20                                                        |

Page sorting uses the earliest segment's page, then creation date and ID for deterministic order. Overlays fetch all result batches for only the mounted document page; the panel uses separate pagination. Empty results are successful, not errors.

Limits: 5,000 note characters; 10,000 selected-text characters; 20 distinct segments; 500 total finite positive rectangles; 100 KB JSON request bodies. Null characters, unknown fields, invalid colors, out-of-document pages/bounds and malformed geometry are rejected. Errors are 400 for validation, 401 for missing sessions, 404 for unowned/mismatched book/annotation IDs, 409 for conflicts, and 413 for oversized JSON.

## Reliability and migrations

The existing repository uses PostgreSQL **with TypeORM**, not Prisma. Phase 4 preserves that database layer and its versioned migrations rather than replacing unrelated authentication/library persistence. Apply with `pnpm db:migrate`; synchronization stays disabled. Geometry and ownership CHECK/FK constraints are authored in SQL; review generated migrations carefully to retain those custom constraints and the GIN index.

A stable `clientRequestId` and canonical payload hash are unique per user/book. Atomic insert-on-conflict handles concurrent/repeated creates. The browser reuses the original payload after an ambiguous failure; retry confirms the prior save before further edits. Changed content under the same key returns 409. Intentional overlapping highlights use different keys and remain distinct.

Updates and deletes use an atomic `WHERE version = expectedVersion` condition and increment the version. Stale edits return 409. The editor keeps the local draft, loads the current saved version for comparison, and requires an explicit action to retry against it. Failed saves remain visible with retry actions; successful saves invalidate both panel and overlay queries. No optimistic update can silently discard a failed edit.

Migration `1791900000001` permits content-free deletion tombstones. Deletion clears text, notes, geometry and document references in a transaction, retaining only identity/request hash/version/timestamps to reject delayed create retries. Deleting the book cascades these records too. Rollback cannot recover deleted note content. Do not roll back annotations migrations expecting Phase 4 notes to survive table removal.

Editors use explicit Save/Cancel, length counters, save status and discard confirmations. Browser navigation is blocked while a draft is dirty, and closing/reloading the tab triggers the native unsaved-changes warning. Drafts live in memory until saved; forcing the browser to close still loses unsaved changes. Notes are rendered as React text, never HTML.

## Review and verification

Final verification on 2026-10-13: **20 backend integration tests and 11 Chromium browser tests passed**, including the existing authentication, library and reader workflows. Both production builds, repository-wide `pnpm format`, `pnpm format:check`, and whitespace checks completed. The migrations were applied to local PostgreSQL. Swagger request/response schemas were inspected at `/api/docs-json`. Visual inspection covered captured multiline, multicolumn, rotated/cropped and scanned-page screens, including the mobile Drawer.

The development sequence was repository review → implementation → focused tests → diff/visual review → fixes → full regression checks and repository-wide Prettier. Review fixes included correct 413 responses, clearing deleted content, stable accessible Save labels after failures, waiting for text-layer rendering before passage jumps, navigation warnings, and literal search escaping.

The native mouse-selection regression exposed a React-PDF text-layer rebuild caused by an unstable render callback. Keeping callbacks stable and waiting until pointer release preserves browser selections. Quick-highlight retries also retain their request identity across repeated selection-change events. Test fixture uploads respect real `Retry-After` responses; production upload/authentication limits remain unchanged.

`apps/api/test/annotations.spec.ts` exercises real PostgreSQL/storage: ownership on every route, wrong-book IDs, database ownership constraints, validation limits, concurrent create retries, payload mismatch, atomic edit conflicts, stale deletes, attached-note removal, standalone-note updates, filtering/pagination, content purging and book cascades.

`tests/annotations.spec.ts` uses real Chromium/PDF.js Range selections and independently compares overlays to the rendered text bounds (under 2 CSS pixels) after zoom, fit changes, sidebar changes, resize, reload and page remounts. Fixtures cover multiline text, two columns, rotations 0/90/180/270, mixed page sizes, a nonzero CropBox, and image-only scans. It also simulates a response lost after the server commits, reconciles competing edits, checks unsaved navigation, exercises overlap choices and searches/paginates long lists. Existing reader tests retain real mouse-drag selection, document search, bookmarks, outline/navigation and progress checks.

Visual artifacts are captured under ignored `artifacts/phase4-*.png` for inspection. Verification is Chromium-based browser automation plus visual inspection of captures; other browsers, native touch selection and screen-reader behavior are not exhaustively verified. This phase adds no OCR, AI, sharing, freehand drawing or PDF export.
