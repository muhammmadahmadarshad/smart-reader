import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Grid,
  InputNumber,
  Result,
  Select,
  Space,
  Spin,
  Tabs,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  HighlightOutlined,
  LeftOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DataNode } from 'antd/es/tree';
import { api } from '../api';
import { colors } from '../theme';
import type { Book } from '../books/types';
import type { Bookmark, TextSelection } from './types';
import { readTextSelection } from './selection';
import { useReadingProgress } from './useReadingProgress';
import BookmarksPanel from './BookmarksPanel';
import SearchPanel from './SearchPanel';
import HighlightsPanel, { useHighlights } from './HighlightsPanel';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const pdfOptions = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  isEvalSupported: false,
  disableAutoFetch: true,
  disableStream: true,
  rangeChunkSize: 262144,
};
type OutlineItems = Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | null;

export default function ReaderPage() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const book = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api<Book>(`/books/${bookId}`),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (book.isPending)
    return (
      <div className="page-loading">
        <Spin tip="Opening your book">
          <div />
        </Spin>
      </div>
    );
  if (book.error || !book.data || book.data.status !== 'READY')
    return (
      <Result
        status="warning"
        title="This book cannot be opened"
        subTitle={book.error?.message || 'The book is not ready.'}
        extra={<Button onClick={() => navigate('/library')}>Return to library</Button>}
      />
    );
  return <Reader key={bookId} book={book.data} />;
}

export function Reader({
  book,
  onTextSelection,
}: {
  book: Book;
  onTextSelection?: (selection: TextSelection) => void;
}) {
  const navigate = useNavigate();
  const query = useQueryClient();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const desktop = !!screens.lg;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(book.progress?.page || 1);
  const [draftPage, setDraftPage] = useState<number | null>(page);
  const [outline, setOutline] = useState<OutlineItems>(null);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState('bookmarks');
  const [zoom, setZoom] = useState<'width' | 'page' | number>('width');
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [areaSize, setAreaSize] = useState({ width: 800, height: 700 });
  const [noText, setNoText] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const highlights = useHighlights(book.id, page);
  const saveHighlight = useMutation({
    mutationFn: (selected: TextSelection) =>
      api(`/books/${book.id}/highlights`, {
        method: 'POST',
        body: JSON.stringify({
          page: selected.page,
          text: selected.text,
          rectangles: selected.rectangles,
        }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ['highlights', book.id] });
      setSelectedText(null);
      window.getSelection()?.removeAllRanges();
      message.success('Highlight saved.');
    },
    onError: (failure) => message.error(failure.message),
  });
  const viewport = useRef<HTMLDivElement>(null);
  const selectionArea = useRef<HTMLDivElement>(null);
  const progress = useReadingProgress(book.id, page, !!pdf && !error);
  const file = useMemo(
    () => ({ url: `/api/books/${book.id}/file`, withCredentials: true }),
    [book.id],
  );
  const bookmarks = useQuery({
    queryKey: ['bookmarks', book.id],
    queryFn: () => api<Bookmark[]>(`/books/${book.id}/bookmarks`),
  });
  const bookmarked = bookmarks.data?.some((item) => item.page === page);
  const bookmark = useMutation({
    mutationFn: () =>
      api(`/books/${book.id}/bookmarks`, {
        method: 'POST',
        body: JSON.stringify({ page, label: `Page ${page}` }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ['bookmarks', book.id] });
      message.success('Page bookmarked.');
    },
    onError: (e) => message.error(e.message),
  });

  useEffect(() => {
    void api(`/books/${book.id}/open`, { method: 'POST' })
      .then(() => query.invalidateQueries({ queryKey: ['books'] }))
      .catch((e: Error) => message.error(e.message));
  }, [book.id, query, message]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setAreaSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    if (pdf)
      void pdf
        .getOutline()
        .then((items) => {
          if (active) setOutline(items);
        })
        .catch(() => {
          if (active) setOutline(null);
        });
    return () => {
      active = false;
    };
  }, [pdf]);
  useEffect(() => {
    let active = true;
    setNoText(false);
    if (pdf)
      void pdf
        .getPage(page)
        .then((p) => p.getTextContent())
        .then((content) => {
          if (active) setNoText(!content.items.some((item) => 'str' in item && item.str.trim()));
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pdf, page]);
  const go = useCallback(
    (number: number) => {
      if (!pdf || !Number.isInteger(number) || number < 1 || number > pdf.numPages) {
        message.warning(`Choose a page between 1 and ${pdf?.numPages || 1}.`);
        setDraftPage(page);
        return;
      }
      setPage(number);
      setDraftPage(number);
      viewport.current?.scrollTo({ top: 0, left: 0 });
    },
    [pdf, page, message],
  );
  const sidebarGo = (number: number) => {
    go(number);
    if (!desktop) setPanel(false);
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName) ||
        element.isContentEditable ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        window.getSelection()?.toString()
      )
        return;
      if (event.key === 'ArrowRight' && pdf && page < pdf.numPages) {
        event.preventDefault();
        go(page + 1);
      }
      if (event.key === 'ArrowLeft' && page > 1) {
        event.preventDefault();
        go(page - 1);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [pdf, page, go]);
  const scale =
    typeof zoom === 'number'
      ? zoom
      : Math.max(
          0.2,
          Math.min(
            3,
            (areaSize.width - 40) / pageSize.width,
            zoom === 'page' ? (areaSize.height - 40) / pageSize.height : Infinity,
          ),
        );
  const outlineMap = useMemo(() => {
    const destinations = new Map<string, NonNullable<OutlineItems>[number]['dest']>();
    const map = (items: NonNullable<OutlineItems>, parent = ''): DataNode[] =>
      items.map((item, index) => {
        const key = `${parent}${index}`;
        destinations.set(key, item.dest);
        return { key, title: item.title, children: map(item.items, `${key}.`) };
      });
    return { tree: outline ? map(outline) : [], destinations };
  }, [outline]);
  async function outlineGo(key: string) {
    if (!pdf) return;
    try {
      let destination = outlineMap.destinations.get(key);
      if (typeof destination === 'string') destination = await pdf.getDestination(destination);
      if (!destination) return;
      const target = destination[0];
      const index = typeof target === 'number' ? target : await pdf.getPageIndex(target);
      sidebarGo(index + 1);
    } catch {
      message.warning('This outline destination could not be opened.');
    }
  }
  async function leave() {
    setLeaving(true);
    try {
      await progress.flush();
      navigate('/library');
    } catch {
      message.error(
        'Your latest position could not be saved. Retry, or use your browser’s back button to leave without saving.',
      );
    } finally {
      setLeaving(false);
    }
  }
  function selection() {
    const element = selectionArea.current?.querySelector<HTMLElement>('.react-pdf__Page');
    const value = element ? readTextSelection(element, book.id, page) : null;
    setSelectedText(value);
    if (value) onTextSelection?.(value);
  }
  useEffect(() => {
    setSelectedText(null);
    window.getSelection()?.removeAllRanges();
  }, [page, scale]);
  useEffect(() => {
    // Native touch selection can finish after pointer-up.
    const changed = () => {
      const element = selectionArea.current?.querySelector<HTMLElement>('.react-pdf__Page');
      const value = element ? readTextSelection(element, book.id, page) : null;
      if (value) setSelectedText(value);
    };
    document.addEventListener('selectionchange', changed);
    return () => document.removeEventListener('selectionchange', changed);
  }, [book.id, page]);
  const panels = (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      size="small"
      items={[
        {
          key: 'highlights',
          label: 'Highlights',
          children: <HighlightsPanel bookId={book.id} page={page} />,
        },
        {
          key: 'bookmarks',
          label: 'Bookmarks',
          children: <BookmarksPanel bookId={book.id} onPage={sidebarGo} />,
        },
        { key: 'search', label: 'Search', children: <SearchPanel pdf={pdf} onPage={sidebarGo} /> },
        ...(outline?.length
          ? [
              {
                key: 'outline',
                label: 'Outline',
                children: (
                  <Tree
                    treeData={outlineMap.tree}
                    onSelect={(keys) => {
                      if (keys[0] !== undefined) void outlineGo(String(keys[0]));
                    }}
                  />
                ),
              },
            ]
          : []),
      ]}
    />
  );
  return (
    <main className="reader-layout">
      <header className="reader-header">
        <Button
          aria-label="Return to library"
          icon={<ArrowLeftOutlined />}
          onClick={() => void leave()}
          loading={leaving}
        >
          Library
        </Button>
        <div className="reader-title">
          <Typography.Text strong ellipsis title={book.title}>
            {book.title}
          </Typography.Text>
          <Typography.Text type="secondary">Smart Reader</Typography.Text>
        </div>
        <Tooltip title={bookmarked ? 'This page is bookmarked' : 'Bookmark this page'}>
          <Button
            aria-label={bookmarked ? 'Page bookmarked' : 'Bookmark this page'}
            type={bookmarked ? 'primary' : 'default'}
            icon={<BookOutlined />}
            loading={bookmark.isPending}
            disabled={!pdf || !!bookmarked}
            onClick={() => bookmark.mutate()}
          />
        </Tooltip>
      </header>
      <div className="reader-toolbar" aria-label="Reader controls">
        <Tooltip title={panel ? 'Close side panel' : 'Open side panel'}>
          <Button
            aria-label={panel ? 'Close side panel' : 'Open side panel'}
            icon={panel ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={() => setPanel(!panel)}
          />
        </Tooltip>
        <Space size={6}>
          <Button
            aria-label="Previous page"
            icon={<LeftOutlined />}
            disabled={!pdf || page <= 1}
            onClick={() => go(page - 1)}
          />
          <InputNumber
            aria-label="Page number"
            value={draftPage}
            min={1}
            max={pdf?.numPages || 1}
            precision={0}
            controls={false}
            onChange={setDraftPage}
            onPressEnter={() => go(draftPage || 0)}
            onBlur={() => {
              if (draftPage !== page) go(draftPage || 0);
            }}
            style={{ width: 66 }}
          />
          <Typography.Text className="page-count">
            of {pdf?.numPages || book.pageCount || '…'}
          </Typography.Text>
          <Button
            aria-label="Next page"
            icon={<RightOutlined />}
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => go(page + 1)}
          />
        </Space>
        <div className="zoom-controls">
          <Button
            aria-label="Zoom out"
            icon={<ZoomOutOutlined />}
            disabled={!pdf || scale <= 0.25}
            onClick={() => setZoom(Math.max(0.25, scale - 0.15))}
          />
          <Select
            virtual={false}
            aria-label="Page zoom"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: 'width', label: 'Fit to width' },
              { value: 'page', label: 'Fit to page' },
              ...Array.from(
                new Set([0.5, 0.75, 1, 1.25, 1.5, 2, ...(typeof zoom === 'number' ? [zoom] : [])]),
              )
                .sort((a, b) => a - b)
                .map((value) => ({ value, label: `${Math.round(value * 100)}%` })),
            ]}
          />
          <Button
            aria-label="Zoom in"
            icon={<ZoomInOutlined />}
            disabled={!pdf || scale >= 3}
            onClick={() => setZoom(Math.min(3, scale + 0.15))}
          />
        </div>
      </div>
      <div className="highlight-toolbar">
        <Tooltip
          title={
            noText ? 'This page has no selectable text' : 'Select text on the PDF to highlight it'
          }
        >
          <Button
            icon={<HighlightOutlined />}
            aria-label="Highlight selection"
            disabled={!selectedText || selectedText.page !== page}
            loading={saveHighlight.isPending}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectedText && saveHighlight.mutate(selectedText)}
          >
            Highlight selection
          </Button>
        </Tooltip>
        <Button
          onClick={() => {
            setTab('highlights');
            setPanel(true);
          }}
        >
          Saved highlights
        </Button>
        <Typography.Text type="secondary" className="highlight-hint">
          {selectedText
            ? 'Text selected — ready to save.'
            : 'Drag across text to highlight a passage.'}
        </Typography.Text>
      </div>
      {progress.status.startsWith('Could not') && (
        <Alert
          type="warning"
          message={progress.status}
          action={
            <Button onClick={() => void progress.flush().catch(() => undefined)}>Retry save</Button>
          }
        />
      )}
      <div className="reader-body">
        {desktop && panel && (
          <aside className="reader-sidebar" aria-label="Document side panel">
            {panels}
          </aside>
        )}
        {!desktop && (
          <Drawer
            title="Your book"
            placement="left"
            width={Math.min(360, window.innerWidth - 24)}
            open={panel}
            onClose={() => setPanel(false)}
          >
            {panels}
          </Drawer>
        )}
        <div className="reading-area" ref={viewport}>
          {error ? (
            <Result
              status="warning"
              title="Unable to display this PDF"
              subTitle={error}
              extra={<Button onClick={() => void leave()}>Return to library</Button>}
            />
          ) : (
            <>
              {noText && (
                <Alert
                  className="scanned-notice"
                  type="info"
                  showIcon
                  message="No selectable text on this page"
                  description="This may be a scanned page. You can read and bookmark it, but selecting or searching its text requires OCR, which is not available."
                />
              )}
              <div
                className="pdf-page-container"
                ref={selectionArea}
                onMouseUp={selection}
                onKeyUp={selection}
              >
                <Document
                  file={file}
                  options={pdfOptions}
                  loading={
                    <div className="pdf-loading">
                      <Spin tip="Loading your PDF">
                        <div />
                      </Spin>
                    </div>
                  }
                  onLoadSuccess={(document) => {
                    setPdf(document);
                    const restored = Math.max(
                      1,
                      Math.min(book.progress?.page || 1, document.numPages),
                    );
                    setPage(restored);
                    setDraftPage(restored);
                  }}
                  onLoadError={(failure) =>
                    setError(
                      failure.name === 'PasswordException'
                        ? 'Password-protected PDFs are not supported. Upload an unlocked copy.'
                        : 'The document could not be loaded. It may be corrupted, unsupported, or the connection was interrupted.',
                    )
                  }
                  onPassword={() =>
                    setError('Password-protected PDFs are not supported. Upload an unlocked copy.')
                  }
                >
                  {pdf && (
                    <Page
                      key={page}
                      pageNumber={page}
                      scale={scale}
                      devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                      renderTextLayer
                      renderAnnotationLayer
                      renderForms={false}
                      onLoadSuccess={(loaded: PDFPageProxy) => {
                        const size = loaded.getViewport({ scale: 1 });
                        setPageSize({ width: size.width, height: size.height });
                      }}
                      onRenderError={() =>
                        setError(
                          'This page could not be rendered. Try reopening the book or uploading another copy.',
                        )
                      }
                      loading={
                        <div className="pdf-loading">
                          <Spin />
                        </div>
                      }
                    >
                      <div className="highlight-overlay" aria-hidden="true">
                        {highlights.data?.flatMap((highlight) =>
                          highlight.rectangles.map((rect, index) => (
                            <span
                              className="saved-highlight"
                              key={`${highlight.id}-${index}`}
                              data-highlight-id={highlight.id}
                              style={{
                                background: colors.highlight,
                                left: `${rect.x * 100}%`,
                                top: `${rect.y * 100}%`,
                                width: `${rect.width * 100}%`,
                                height: `${rect.height * 100}%`,
                              }}
                            />
                          )),
                        )}
                      </div>
                    </Page>
                  )}
                </Document>
              </div>
            </>
          )}
        </div>
      </div>
      <footer className="reader-footer">
        <span>
          Page {page} of {pdf?.numPages || book.pageCount || '…'}
        </span>
        <span role="status">{progress.status}</span>
      </footer>
    </main>
  );
}
