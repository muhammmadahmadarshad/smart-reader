import { getEncoding } from 'js-tiktoken';
import { createHash } from 'node:crypto';
import { prefix } from './text-limits';
const encoding = getEncoding('cl100k_base');
export const embeddingTokens = (text: string) => encoding.encode(text, [], []).length;
export function tokenChunks(
  text: string,
  page: number,
  identity: string,
  maxTokens: number,
  overlapTokens: number,
) {
  if (
    !Number.isInteger(maxTokens) ||
    maxTokens < 32 ||
    !Number.isInteger(overlapTokens) ||
    overlapTokens < 0 ||
    overlapTokens >= maxTokens
  )
    throw new Error('Invalid token chunk limits.');
  const chunks: {
    stableId: string;
    text: string;
    tokens: number;
    spans: { page: number; start: number; end: number }[];
  }[] = [];
  let start = 0;
  while (start < text.length) {
    let low = 1,
      high = Math.min(text.length - start, maxTokens * 8),
      fit = 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const candidate = prefix(text.slice(start), middle);
      if (embeddingTokens(candidate) <= maxTokens) {
        fit = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    let content = prefix(text.slice(start), fit);
    const boundary = content.lastIndexOf('\n\n');
    if (
      start + content.length < text.length &&
      boundary > 0 &&
      embeddingTokens(content.slice(0, boundary + 2)) > overlapTokens
    )
      content = content.slice(0, boundary + 2);
    if (!content.length) throw new Error('Unable to split source text.');
    const end = start + content.length;
    if (content.trim())
      chunks.push({
        stableId: createHash('sha256')
          .update(JSON.stringify([identity, page, start, end, content, maxTokens, overlapTokens]))
          .digest('hex'),
        text: content,
        tokens: embeddingTokens(content),
        spans: [{ page, start, end }],
      });
    if (end === text.length) break;
    let overlap = 0;
    low = 0;
    high = content.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (embeddingTokens(content.slice(content.length - middle)) <= overlapTokens) {
        overlap = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    let next = end - overlap;
    if (/[\uDC00-\uDFFF]/.test(text[next]) && /[\uD800-\uDBFF]/.test(text[next - 1])) next++;
    start = Math.max(start + 1, next);
  }
  return chunks;
}
