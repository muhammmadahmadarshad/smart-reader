import type { TextSelection } from './types';
export function readTextSelection(
  container: HTMLElement,
  bookId: string,
  page: number,
): TextSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const layer = container.querySelector('.react-pdf__Page__textContent');
  if (!layer?.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const bounds = container.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const rectangles = Array.from(range.getClientRects())
    .map((rect) => {
      const x = Math.max(0, (rect.left - bounds.left) / bounds.width);
      const y = Math.max(0, (rect.top - bounds.top) / bounds.height);
      return {
        x,
        y,
        width: Math.min(1, (rect.right - bounds.left) / bounds.width) - x,
        height: Math.min(1, (rect.bottom - bounds.top) / bounds.height) - y,
      };
    })
    .filter((rect) => rect.width > 0.000001 && rect.height > 0.000001)
    .filter(
      (rect, index, all) =>
        all.findIndex(
          (other) =>
            Math.abs(other.x - rect.x) < 0.00001 &&
            Math.abs(other.y - rect.y) < 0.00001 &&
            Math.abs(other.width - rect.width) < 0.00001 &&
            Math.abs(other.height - rect.height) < 0.00001,
        ) === index,
    );
  if (!rectangles.length) return null;
  return {
    bookId,
    page,
    text,
    rectangles,
  };
}
