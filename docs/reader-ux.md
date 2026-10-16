# Reader interface and performance update

The reader keeps the book in focus. Notes and Assistant are the two visible workspace actions;
bookmarks, search, and the outline are grouped under Navigate. Selecting text opens the annotation
popover; AI actions open from its Ask AI menu. The former extra action toolbar is removed.

## Notes

The notes panel shows a search field, a New note action, and readable cards. Type, color, and sorting
controls are available from Filter notes. Active filters remain visible. Cards distinguish the quoted
passage from the personal note and retain page navigation, editing, and deletion. Existing notes stay
on screen while a new search or page loads.

## Assistant

The conversation scrolls independently of the composer. Model selection, connection management, and
conversation history open on demand. Preparation and coverage information appears in book-wide mode;
selection mode focuses on the selected passage. Provider disclosure and original-source provenance
remain visible or explicitly expandable.

Drafts, selected models, conversations, and active requests survive closing the panel and switching
between the desktop sidebar and mobile Drawer. Cancellation preserves incomplete text and requires
an explicit new request. Ctrl+Enter (Command+Enter on macOS) sends a question; Enter inserts a newline.

## Code organization

- `reader/ReaderPage.tsx`: reader navigation, PDF rendering, and workspace composition.
- `reader/BookToolsPanel.tsx`: bookmarks, search, and outline navigation.
- `reader/AnnotationsPanel.tsx`: notes list, filters, and annotation cards.
- `reader/AnnotationColors.tsx`: shared highlight colors and their picker.
- `ai/BookAssistantSession.tsx`: stable session lifetime across responsive layouts, with updates
  limited to assistant consumers rather than the PDF tree.
- `ai/useBookAssistant.ts`: server synchronization, request lifecycle, and cancellation.
- `ai/assistant-stream.ts`: typed newline-delimited event decoding across network packets.
- `ai/AssistantControls.tsx`, `BookPreparation.tsx`, and `SavedAnswer.tsx`: focused display components.
- `ai/assistant.css`: assistant styles, loaded with its panel.

## Work removed from the reading path

- Index polling runs only for queued or processing indexes while the assistant is visible.
- Streamed requests do not also poll the messages endpoint.
- Fast text deltas are batched into 50 ms display updates; incomplete text is not repeatedly parsed
  as Markdown. Saved answer rendering is memoized.
- PDF text availability uses the text layer's extraction result instead of extracting the page again.
- PDF canvas resizing waits for a 100 ms quiet period during resize bursts.
- The assistant panel and Markdown renderer load when opened.
- Library searches retain the preceding results with an Updating indicator, avoiding skeleton flashes.

## Verification

The browser suite covers reader navigation, bookmarks, search, highlight alignment, annotation
editing and retries, notes filters, model switching, source navigation, disabled capabilities, and
safe Markdown. Additional checks cover idle network behavior, unsent drafts across sidebar and
screen-size changes, composer visibility, and cancellation with preserved partial text.

Verified: all 13 Playwright browser tests, both TypeScript checks, both production builds, formatting
for the changed frontend files, and `git diff --check` passed. Tests use fixture providers, with no
paid model calls. Desktop and 390 px mobile screenshots were reviewed and are written to the ignored
`artifacts/` directory.
Vite still reports the existing large application/PDF bundle warning; these changes do not establish
a universal latency improvement for every PDF or device.
