import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextSelection } from './types';
export function readTextSelection(
  container: HTMLElement,
  bookId: string,
  page: number,
  pdfPage: PDFPageProxy,
): TextSelection | null {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount !== 1 ||
    pdfPage.pageNumber !== page
  )
    return null;
  const range = selection.getRangeAt(0);
  const layer = container.querySelector('.react-pdf__Page__textContent');
  if (!layer?.contains(range.startContainer) || !layer.contains(range.endContainer)) return null;
  const text = selection.toString().trim();
  if (!text || text.length > 10000) return null;
  const bounds = container.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  const viewport = pdfPage.getViewport({ scale: 1 });
  // Individual text-node rectangles avoid the large ancestor box across lines/columns.
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const rectangles: TextSelection['rectangles'] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node) || !node.textContent?.trim()) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    for (const r of Array.from(part.getClientRects())) {
      if (r.width < 0.1 || r.height < 0.1) continue;
      const left = (Math.max(0, r.left - bounds.left) / bounds.width) * viewport.width;
      const top = (Math.max(0, r.top - bounds.top) / bounds.height) * viewport.height;
      const right = (Math.min(bounds.width, r.right - bounds.left) / bounds.width) * viewport.width;
      const bottom =
        (Math.min(bounds.height, r.bottom - bounds.top) / bounds.height) * viewport.height;
      const a = viewport.convertToPdfPoint(left, top),
        b = viewport.convertToPdfPoint(right, bottom);
      const rect = {
        x: Math.min(a[0], b[0]),
        y: Math.min(a[1], b[1]),
        width: Math.abs(a[0] - b[0]),
        height: Math.abs(a[1] - b[1]),
      };
      if (
        rect.width > 0.000001 &&
        rect.height > 0.000001 &&
        !rectangles.some((other) =>
          Object.keys(rect).every(
            (key) =>
              Math.abs(other[key as keyof typeof rect] - rect[key as keyof typeof rect]) < 0.001,
          ),
        )
      )
        rectangles.push(rect);
    }
  }
  if (!rectangles.length || rectangles.length > 500) return null;
  const last = range.getBoundingClientRect();
  return { bookId, page, text, rectangles, anchor: { x: last.left + last.width / 2, y: last.top } };
}
export function viewportRectangle(
  rect: TextSelection['rectangles'][number],
  pdfPage: PDFPageProxy,
  coordinateVersion: number,
) {
  if (coordinateVersion === 1) return rect;
  const viewport = pdfPage.getViewport({ scale: 1 });
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y + rect.height,
  ]);
  return {
    x: Math.min(x1, x2) / viewport.width,
    y: Math.min(y1, y2) / viewport.height,
    width: Math.abs(x2 - x1) / viewport.width,
    height: Math.abs(y2 - y1) / viewport.height,
  };
}
