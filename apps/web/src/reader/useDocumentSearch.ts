import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SearchMatch } from './types';
export function useDocumentSearch(pdf: PDFDocumentProxy | null) {
  const generation = useRef(0);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [scanned, setScanned] = useState(0);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');
  const cancel = useCallback(() => {
    generation.current++;
    setRunning(false);
  }, []);
  useEffect(
    () => () => {
      generation.current++;
    },
    [pdf],
  );
  const search = useCallback(
    async (input: string) => {
      const run = ++generation.current;
      const term = input.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      setMatches([]);
      setScanned(0);
      setNote('');
      if (!pdf || !term) {
        setRunning(false);
        return;
      }
      setRunning(true);
      const found: SearchMatch[] = [];
      let hasText = false;
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          if (run !== generation.current) return;
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          if (run !== generation.current) return;
          const text = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ');
          hasText ||= text.trim().length > 0;
          const lower = text.toLocaleLowerCase();
          let offset = lower.indexOf(term);
          while (offset >= 0 && found.length < 1000) {
            found.push({
              page: number,
              offset,
              snippet: `${offset > 35 ? '…' : ''}${text.slice(Math.max(0, offset - 35), offset + term.length + 65)}…`,
            });
            offset = lower.indexOf(term, offset + Math.max(1, term.length));
          }
          setScanned(number);
          setMatches([...found]);
          if (found.length >= 1000) {
            setNote(
              'Showing the first 1,000 matches. Use a more specific search to narrow the results.',
            );
            break;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (!hasText)
          setNote(
            'This document has no selectable text. Scanned pages can be viewed, but text search requires OCR, which is not available.',
          );
        else if (!found.length) setNote('No matches found. Try a different word or phrase.');
      } catch {
        if (run === generation.current)
          setNote('Search could not finish. Try again or reopen the document.');
      } finally {
        if (run === generation.current) setRunning(false);
      }
    },
    [pdf],
  );
  return { matches, scanned, running, note, search, cancel };
}
