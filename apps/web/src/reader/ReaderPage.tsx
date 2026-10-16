import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  ConfigProvider,
  Drawer,
  Grid,
  InputNumber,
  Popover,
  Result,
  Select,
  Space,
  Spin,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  BookOutlined,
  CommentOutlined,
  EditOutlined,
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
import { api } from '../api';
import type { Book } from '../books/types';
import type { Bookmark, TextSelection } from './types';
import { readTextSelection, viewportRectangle } from './selection';
import type { Capability } from '../ai/assistant-types';
import { BookAssistantSession } from '../ai/BookAssistantSession';
import type { SelectionContextInput, SourceReference, AiAction } from '../ai/types';
import { useReadingProgress } from './useReadingProgress';
import BookToolsPanel from './BookToolsPanel';
import { useAnnotationTools } from './Annotations';
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
const AiPanel = lazy(() => import('../ai/AiPanel'));

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
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState('book');
  const [zoom, setZoom] = useState<'width' | 'page' | number>('width');
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [areaSize, setAreaSize] = useState({ width: 800, height: 700 });
  const [noText, setNoText] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [aiSelection, setAiSelection] = useState<SelectionContextInput | null>(null);
  const [citation, setCitation] = useState<SourceReference | null>(null);
  const aiCapabilities = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<Capability>('/ai/capabilities'),
  });
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [renderedPage, setRenderedPage] = useState(0);
  // React-PDF rebuilds its text layer when this callback changes, invalidating native selections.
  const textLayerRendered = useCallback(() => setRenderedPage(page), [page]);
  const textLoaded = useCallback((content: Awaited<ReturnType<PDFPageProxy['getTextContent']>>) => {
    setNoText(!content.items.some((item) => 'str' in item && item.str.trim()));
  }, []);
  const pageRenderFailed = useCallback(
    () =>
      setError(
        'This page could not be rendered. Try reopening the book or uploading another copy.',
      ),
    [],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const selectionArea = useRef<HTMLDivElement>(null);
  const selecting = useRef(false);
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
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      clearTimeout(timer);
      // Resize the expensive PDF canvas once after a resize burst, not on every pixel.
      timer = setTimeout(
        () =>
          setAreaSize((previous) =>
            previous.width === width && previous.height === height ? previous : { width, height },
          ),
        100,
      );
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setNoText(false);
  }, [pdf, page]);
  const go = useCallback(
    (number: number) => {
      if (!pdf || !Number.isInteger(number) || number < 1 || number > pdf.numPages) {
        message.warning(`Choose a page between 1 and ${pdf?.numPages || 1}.`);
        setDraftPage(page);
        return;
      }
      setPage(number);
      if (number !== page) setRenderedPage(0);
      setDraftPage(number);
      viewport.current?.scrollTo({ top: 0, left: 0 });
    },
    [pdf, page, message],
  );
  const sidebarGo = (number: number) => {
    go(number);
    if (!desktop) setPanel(false);
  };
  const clearSelection = useCallback(() => setSelectedText(null), []);
  const assist = (action: AiAction, language = 'en') => {
    if (!selectedText) return;
    const snapshot = structuredClone(selectedText);
    setAiSelection({
      bookId: book.id,
      documentVersion: book.id,
      selectedText: snapshot.text,
      pages: { first: snapshot.page, last: snapshot.page },
      anchors: {
        bookId: book.id,
        documentVersion: book.id,
        coordinateVersion: 2,
        segments: [{ page: snapshot.page, rectangles: snapshot.rectangles }],
      },
      action,
      language,
    });
    setTab('ai');
    setPanel(true);
    clearSelection();
    window.getSelection()?.removeAllRanges();
  };
  const annotations = useAnnotationTools({
    bookId: book.id,
    page,
    pdfPage: renderedPage === page ? pdfPage : null,
    selected: selectedText,
    clearSelection,
    onPage: sidebarGo,
    container: selectionArea,
    aiActions: (
      <Popover
        trigger="click"
        placement="bottom"
        content={
          <Space direction="vertical" className="selection-ai-actions">
            {(
              [
                ['Explain', 'EXPLAIN', 'en'],
                ['Give an example', 'GIVE_EXAMPLE', 'en'],
                ['Explain in Urdu', 'EXPLAIN', 'ur'],
                ['Ask AI', 'ASK_FOLLOWUP', 'en'],
              ] as const
            ).map(([label, action, language]) => (
              <Tooltip
                key={label}
                title={
                  aiCapabilities.data?.generation
                    ? label
                    : 'Add and validate a connection in AI Settings'
                }
              >
                <Button
                  disabled={!aiCapabilities.data?.generation}
                  onClick={() => assist(action, language)}
                >
                  {label}
                </Button>
              </Tooltip>
            ))}
            {!aiCapabilities.data?.generation && (
              <Button type="link" onClick={() => navigate('/ai-settings')}>
                Add connection
              </Button>
            )}
          </Space>
        }
      >
        <Button aria-label="Ask AI" icon={<CommentOutlined />}>
          Ask AI
        </Button>
      </Popover>
    ),
  });
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (annotations.editorOpen) return;
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
  }, [pdf, page, go, annotations.editorOpen]);
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
    const value = element && pdfPage ? readTextSelection(element, book.id, page, pdfPage) : null;
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
      if (selecting.current) return;
      const element = selectionArea.current?.querySelector<HTMLElement>('.react-pdf__Page');
      const value = element && pdfPage ? readTextSelection(element, book.id, page, pdfPage) : null;
      if (value) setSelectedText(value);
      else if (!window.getSelection()?.isCollapsed) setSelectedText(null);
    };
    const finished = () => {
      if (!selecting.current) return;
      selecting.current = false;
      changed();
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('pointerup', finished);
    document.addEventListener('pointercancel', finished);
    return () => {
      document.removeEventListener('selectionchange', changed);
      document.removeEventListener('pointerup', finished);
      document.removeEventListener('pointercancel', finished);
    };
  }, [book.id, page, pdfPage]);
  const panels = (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      size="small"
      items={[
        {
          key: 'ai',
          label: 'Assistant',
          children: (
            <Suspense
              fallback={
                <div className="panel-loading">
                  <Spin />
                </div>
              }
            >
              <AiPanel
                selection={aiSelection}
                onClear={() => setAiSelection(null)}
                onSource={(source) => {
                  if (
                    source.bookId !== book.id ||
                    source.documentVersion !== book.id ||
                    !source.pages
                  ) {
                    message.warning('This source is unavailable.');
                    return;
                  }
                  setCitation(source);
                  sidebarGo(source.pages.first);
                }}
              />
            </Suspense>
          ),
        },
        {
          key: 'highlights',
          label: 'Notes',
          children: annotations.panel,
        },
        {
          key: 'book',
          label: 'Navigate',
          children: <BookToolsPanel bookId={book.id} pdf={pdf} onPage={sidebarGo} />,
        },
      ]}
    />
  );
  return (
    <ConfigProvider theme={{ token: { controlHeight: 32 } }}>
      <BookAssistantSession
        bookId={book.id}
        visible={panel && tab === 'ai'}
        selection={aiSelection}
      >
        <main className="reader-layout">
          <header className="reader-header">
            <Button
              className="reader-library-button"
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
            <div className="reader-workspace-actions">
              <Button
                aria-label="Notes and highlights"
                aria-pressed={panel && tab === 'highlights'}
                type={panel && tab === 'highlights' ? 'primary' : 'text'}
                icon={<EditOutlined />}
                onClick={() => {
                  setTab('highlights');
                  setPanel(true);
                }}
              >
                Notes
              </Button>
              <Button
                aria-label="AI assistant"
                aria-pressed={panel && tab === 'ai'}
                type={panel && tab === 'ai' ? 'primary' : 'text'}
                icon={<CommentOutlined />}
                onClick={() => {
                  setTab('ai');
                  setPanel(true);
                }}
              >
                Assistant
              </Button>
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
                style={{ width: 56 }}
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
                    new Set([
                      0.5,
                      0.75,
                      1,
                      1.25,
                      1.5,
                      2,
                      ...(typeof zoom === 'number' ? [zoom] : []),
                    ]),
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
          {annotations.toolbar}
          {annotations.dialog}
          {progress.status.startsWith('Could not') && (
            <Alert
              type="warning"
              message={progress.status}
              action={
                <Button onClick={() => void progress.flush().catch(() => undefined)}>
                  Retry save
                </Button>
              }
            />
          )}
          <div className="reader-body">
            {desktop && (
              <aside className="reader-sidebar" hidden={!panel} aria-label="Document side panel">
                {panels}
              </aside>
            )}
            {!desktop && (
              <Drawer
                className="reader-drawer"
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
                      description="This may be a scanned page. You can read, bookmark, and add standalone book notes. Highlighting and text search need a text layer; OCR is not available."
                    />
                  )}
                  <div
                    className="pdf-page-container"
                    ref={selectionArea}
                    onPointerDown={() => {
                      selecting.current = true;
                      setSelectedText(null);
                    }}
                    onMouseUp={selection}
                    onClick={annotations.hitTest}
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
                        setError(
                          'Password-protected PDFs are not supported. Upload an unlocked copy.',
                        )
                      }
                    >
                      {pdf && (
                        <Page
                          key={page}
                          pageNumber={page}
                          scale={scale}
                          devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                          renderTextLayer
                          onGetTextSuccess={textLoaded}
                          onRenderTextLayerSuccess={textLayerRendered}
                          renderAnnotationLayer
                          renderForms={false}
                          onLoadSuccess={(loaded: PDFPageProxy) => {
                            setPdfPage(loaded);
                            const size = loaded.getViewport({ scale: 1 });
                            setPageSize({ width: size.width, height: size.height });
                          }}
                          onRenderError={pageRenderFailed}
                          loading={
                            <div className="pdf-loading">
                              <Spin />
                            </div>
                          }
                        >
                          {annotations.overlay}
                          {citation?.selection?.segments
                            .filter((segment) => segment.page === page)
                            .flatMap((segment) => segment.rectangles)
                            .map((rectangle, i) => {
                              if (!pdfPage || renderedPage !== page) return null;
                              const rect = viewportRectangle(rectangle, pdfPage, 2);
                              return (
                                <span
                                  key={`citation-${i}`}
                                  className="ai-source-emphasis"
                                  style={{
                                    position: 'absolute',
                                    pointerEvents: 'none',
                                    left: `${rect.x * 100}%`,
                                    top: `${rect.y * 100}%`,
                                    width: `${rect.width * 100}%`,
                                    height: `${rect.height * 100}%`,
                                    background: 'rgba(47,93,69,.18)',
                                    outline: '2px solid #2f5d45',
                                    zIndex: 4,
                                  }}
                                />
                              );
                            })}
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
      </BookAssistantSession>
    </ConfigProvider>
  );
}
