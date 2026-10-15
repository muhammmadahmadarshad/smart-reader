import { createHash } from 'node:crypto';
import type {
  ChunkingConfig,
  DocumentChunk,
  DocumentIdentity,
  ExtractedPageText,
  ProcessingVersions,
} from './rag.contracts';
import { prefix } from './text-limits';

/** Pure, page-local chunking. Input is not normalized or trimmed; offsets are half-open UTF-16
 * ranges into the exact supplied text. Never joins pages or splits valid surrogate pairs.
 * Prefer the last paragraph boundary fitting the window; overlap is at most overlapChars. */
export function chunkPageText(
  document: DocumentIdentity,
  versions: ProcessingVersions,
  pages: readonly ExtractedPageText[],
  config: ChunkingConfig,
): DocumentChunk[] {
  if (
    ![
      document.bookId,
      document.documentVersion,
      versions.extractionVersion,
      versions.chunkingVersion,
    ].every((v) => typeof v === 'string' && v.trim())
  )
    throw new Error('Document identity and processing versions are required.');
  if (
    !Number.isSafeInteger(config.chunkChars) ||
    config.chunkChars < 2 ||
    config.chunkChars > 1000000 ||
    !Number.isSafeInteger(config.overlapChars) ||
    config.overlapChars < 0 ||
    config.overlapChars >= config.chunkChars
  )
    throw new Error(
      'Chunk size must be 2..1000000 characters and overlap must be nonnegative and smaller than chunk size.',
    );
  const chunks: DocumentChunk[] = [];
  let previousPage = 0;
  for (const page of pages) {
    if (
      !Number.isSafeInteger(page.page) ||
      page.page <= previousPage ||
      typeof page.text !== 'string'
    )
      throw new Error('Pages must have text and distinct, increasing one-based page numbers.');
    previousPage = page.page;
    const text = page.text;
    if (!text.trim()) continue;
    const boundaries = Array.from(
      text.matchAll(/\r?\n[\t ]*\r?\n/g),
      (match) => match.index + match[0].length,
    );
    let boundaryIndex = 0;
    let start = 0;
    while (start < text.length) {
      let end =
        start + prefix(text.slice(start, start + config.chunkChars + 1), config.chunkChars).length;
      let paragraphEnd: number | undefined;
      while (boundaryIndex < boundaries.length && boundaries[boundaryIndex] <= end) {
        if (boundaries[boundaryIndex] > start + config.overlapChars)
          paragraphEnd = boundaries[boundaryIndex];
        boundaryIndex++;
      }
      if (end < text.length && paragraphEnd !== undefined) end = paragraphEnd;
      const content = text.slice(start, end);
      const span = { page: page.page, start, end };
      if (content.trim()) {
        const identity = [
          document.bookId,
          document.documentVersion,
          versions.extractionVersion,
          versions.chunkingVersion,
          config.chunkChars,
          config.overlapChars,
          page.page,
          start,
          end,
          content,
        ];
        chunks.push({
          ...document,
          ...versions,
          id: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
          text: content,
          spans: [span],
          config: { ...config },
        });
      }
      if (end === text.length) break;
      let next = Math.max(start + 1, end - config.overlapChars);
      if (/[\uDC00-\uDFFF]/.test(text[next]) && /[\uD800-\uDBFF]/.test(text[next - 1])) next++;
      start = next;
    }
  }
  return chunks;
}
