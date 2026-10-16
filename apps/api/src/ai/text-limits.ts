/** Cut at a UTF-16 boundary without splitting a valid surrogate pair. No normalization. */
export function prefix(text: string, max: number): string {
  let end = Math.max(0, Math.min(text.length, max));
  if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end] ?? ''))
    end--;
  return text.slice(0, end);
}
/** Only call with optional text already loaded through an authorized source. */
export function boundOptionalText(text: string, limit: number, remaining: number) {
  const bounded = prefix(text, Math.min(limit, remaining));
  return { text: bounded, truncated: bounded.length < text.length };
}
