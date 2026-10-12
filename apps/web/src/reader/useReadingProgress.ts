import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
export function useReadingProgress(bookId: string, page: number, enabled: boolean) {
  const query = useQueryClient();
  const [status, setStatus] = useState('');
  const current = useRef({ page, enabled });
  current.current = { page, enabled };
  const lastSaved = useRef<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  const flush = useCallback(() => {
    const snapshot = current.current;
    if (!snapshot.enabled) return Promise.resolve();
    const next = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (lastSaved.current === snapshot.page) return;
        if (alive.current) setStatus('Saving position…');
        await api(`/books/${bookId}/progress`, {
          method: 'PUT',
          body: JSON.stringify({ page: snapshot.page }),
          keepalive: true,
        });
        lastSaved.current = snapshot.page;
        void query.invalidateQueries({ queryKey: ['books'] });
        // Do not refetch the reader's initial snapshot while the user is navigating.
        query.removeQueries({ queryKey: ['book', bookId], type: 'inactive' });
        if (alive.current) setStatus('Position saved');
      });
    queue.current = next;
    return next.catch((error: Error) => {
      if (alive.current) setStatus(`Could not save position: ${error.message}`);
      throw error;
    });
  }, [bookId, query]);
  useEffect(() => {
    if (!enabled) return;
    if (lastSaved.current !== page) setStatus('Saving position…');
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [page, enabled, flush]);
  useEffect(() => {
    alive.current = true;
    const save = () => {
      void flush().catch(() => undefined);
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      save();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [flush]);
  return { status, flush };
}
