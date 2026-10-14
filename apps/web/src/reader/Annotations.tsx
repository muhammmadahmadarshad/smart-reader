import { useEffect, useRef, useState, type RefObject, type MouseEvent } from 'react';
import { Alert, App, Button, Input, Modal, Popover, Space, Typography } from 'antd';
import { HighlightOutlined } from '@ant-design/icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { PDFPageProxy } from 'pdfjs-dist';
import { useBlocker } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { Annotation, AnnotationList, TextSelection } from './types';
import { viewportRectangle } from './selection';
import AnnotationsPanel, { annotationColors, ColorPicker } from './AnnotationsPanel';
type Editor = { item?: Annotation; selection?: TextSelection; key: string; initialColor: string };
export function useAnnotationTools({
  bookId,
  page,
  pdfPage,
  selected,
  clearSelection,
  onPage,
  container,
}: {
  bookId: string;
  page: number;
  pdfPage: PDFPageProxy | null;
  selected: TextSelection | null;
  clearSelection: () => void;
  onPage: (page: number) => void;
  container: RefObject<HTMLDivElement | null>;
}) {
  const { message, modal } = App.useApp();
  const query = useQueryClient();
  const [color, setColor] = useState('#F5E6A8');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState('');
  const [editColor, setEditColor] = useState('#F5E6A8');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Annotation | null>(null);
  const [pendingCreate, setPendingCreate] = useState<object | null>(null);
  const [jump, setJump] = useState<{ id: string; page: number } | null>(null);
  const [emphasis, setEmphasis] = useState('');
  const savingRef = useRef(false);
  const selectedRequest = useRef<{ signature: string; payload: object } | null>(null);
  const [quickError, setQuickError] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const pageQuery = useInfiniteQuery({
    queryKey: ['annotations', bookId, 'page', page],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<AnnotationList>(
        `/books/${bookId}/annotations?documentPage=${page}&pageSize=100&page=${pageParam}`,
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  useEffect(() => {
    if (pageQuery.hasNextPage && !pageQuery.isFetching && !pageQuery.isFetchNextPageError)
      void pageQuery.fetchNextPage();
  }, [
    pageQuery.hasNextPage,
    pageQuery.isFetching,
    pageQuery.isFetchNextPageError,
    pageQuery.fetchNextPage,
  ]);
  const visible = pageQuery.data?.pages.flatMap((batch) => batch.items) || [];
  const invalidate = () => query.invalidateQueries({ queryKey: ['annotations', bookId] });
  const dirty =
    !!editor && (draft !== (editor.item?.noteText || '') || editColor !== editor.initialColor);
  const blocker = useBlocker(dirty || saving || !!pendingCreate);
  const navigationPrompt = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || navigationPrompt.current) return;
    navigationPrompt.current = true;
    modal.confirm({
      title: 'Leave without saving your note?',
      content: 'Your draft will be discarded. A request already sent may still finish saving.',
      okText: 'Leave',
      cancelText: 'Keep editing',
      onOk: () => {
        navigationPrompt.current = false;
        blocker.proceed();
      },
      onCancel: () => {
        navigationPrompt.current = false;
        blocker.reset();
      },
    });
  }, [blocker, modal]);
  useEffect(() => {
    if (!dirty && !saving && !pendingCreate) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving, pendingCreate]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editor && !quickSaving) {
        clearSelection();
        window.getSelection()?.removeAllRanges();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [clearSelection, editor, quickSaving]);
  useEffect(() => {
    if (!selected) setQuickError('');
  }, [selected]);
  useEffect(() => {
    if (!jump || jump.page !== page) return;
    const find = () => {
      const element = container.current?.querySelector<HTMLElement>(
        `[data-highlight-id="${jump.id}"]`,
      );
      if (!element) return;
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      setEmphasis(jump.id);
      setJump(null);
    };
    find();
    const observer = new MutationObserver(find);
    if (container.current) observer.observe(container.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [jump, page, container, visible.length, pdfPage]);
  useEffect(() => {
    if (!emphasis) return;
    const timer = window.setTimeout(() => setEmphasis(''), 2200);
    return () => clearTimeout(timer);
  }, [emphasis]);
  function open(item?: Annotation, selection?: TextSelection) {
    setEditor({ item, selection, key: crypto.randomUUID(), initialColor: item?.color || color });
    setDraft(item?.noteText || '');
    setEditColor(item?.color || color);
    setFailure('');
    setConflict(false);
    setLatest(null);
    setPendingCreate(null);
    clearSelection();
    window.getSelection()?.removeAllRanges();
  }
  function close() {
    if (savingRef.current) return;
    if (dirty || pendingCreate)
      modal.confirm({
        title: 'Discard unsaved changes?',
        content: pendingCreate
          ? 'The last request may have reached the server. Retry saving to confirm it, or discard this draft and check your annotations.'
          : 'Your note has unsaved changes.',
        okText: 'Discard',
        onOk: () => {
          setEditor(null);
          setPendingCreate(null);
        },
      });
    else setEditor(null);
  }
  function createPayload(
    selection: TextSelection | undefined,
    noteText: string,
    selectedColor: string,
    key: string,
  ) {
    return selection
      ? {
          clientRequestId: key,
          kind: 'HIGHLIGHT',
          selectedText: selection.text,
          noteText: noteText || null,
          color: selectedColor,
          documentVersion: bookId,
          coordinateVersion: 2,
          segments: [{ page: selection.page, rectangles: selection.rectangles }],
        }
      : { clientRequestId: key, kind: 'NOTE', noteText };
  }
  async function quickSave() {
    if (!selected || savingRef.current) return;
    savingRef.current = true;
    setQuickSaving(true);
    setQuickError('');
    const signature = JSON.stringify({
      page: selected.page,
      text: selected.text,
      rectangles: selected.rectangles,
    });
    if (selectedRequest.current?.signature !== signature)
      selectedRequest.current = {
        signature,
        payload: createPayload(selected, '', color, crypto.randomUUID()),
      };
    try {
      await api(`/books/${bookId}/annotations`, {
        method: 'POST',
        body: JSON.stringify(selectedRequest.current.payload),
      });
      clearSelection();
      window.getSelection()?.removeAllRanges();
      selectedRequest.current = null;
      await invalidate();
      message.success('Highlight saved.');
    } catch (e) {
      setQuickError((e as Error).message);
    } finally {
      savingRef.current = false;
      setQuickSaving(false);
    }
  }
  async function save() {
    if (!editor || savingRef.current || conflict) return;
    savingRef.current = true;
    setSaving(true);
    setFailure('');
    const payload = editor.item
      ? {
          version: editor.item.version,
          noteText: draft,
          ...(editor.item.kind === 'HIGHLIGHT' ? { color: editColor } : {}),
        }
      : pendingCreate || createPayload(editor.selection, draft, editColor, editor.key);
    if (!editor.item) setPendingCreate(payload);
    try {
      await api(`/books/${bookId}/annotations${editor.item ? `/${editor.item.id}` : ''}`, {
        method: editor.item ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setEditor(null);
      setPendingCreate(null);
      window.getSelection()?.removeAllRanges();
      await invalidate();
      message.success('Annotation saved.');
    } catch (e) {
      setFailure((e as Error).message);
      setConflict(e instanceof ApiError && e.status === 409);
      if (e instanceof ApiError && e.status === 400) setPendingCreate(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function loadLatest() {
    if (!editor?.item) return;
    try {
      setLatest(await api<Annotation>(`/books/${bookId}/annotations/${editor.item.id}`));
    } catch (e) {
      setFailure((e as Error).message);
    }
  }
  function remove(item: Annotation) {
    modal.confirm({
      title: item.kind === 'HIGHLIGHT' ? 'Delete highlight?' : 'Delete note?',
      content:
        item.noteText && item.kind === 'HIGHLIGHT'
          ? 'This also permanently deletes its attached note.'
          : 'This annotation will be deleted.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`/books/${bookId}/annotations/${item.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ version: item.version }),
          });
          await invalidate();
          message.success('Annotation deleted.');
        } catch (e) {
          message.error(`${(e as Error).message} Reload the list and retry.`);
          await invalidate();
          throw e;
        }
      },
    });
  }
  const hitTest = (event: MouseEvent) => {
    if (window.getSelection()?.toString().trim()) return;
    const ids = new Set(
      Array.from(container.current?.querySelectorAll<HTMLElement>('[data-highlight-id]') || [])
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            event.clientX >= r.left &&
            event.clientX <= r.right &&
            event.clientY >= r.top &&
            event.clientY <= r.bottom
          );
        })
        .map((el) => el.dataset.highlightId),
    );
    const hits = visible.filter((item) => ids.has(item.id));
    if (hits.length === 1) open(hits[0]);
    else if (hits.length > 1) {
      const dialog = modal.info({
        title: 'Overlapping highlights',
        content: (
          <Space direction="vertical">
            {hits.map((item, i) => (
              <Button
                key={item.id}
                onClick={() => {
                  dialog.destroy();
                  open(item);
                }}
              >
                {i + 1}. {item.selectedText?.slice(0, 50)}
              </Button>
            ))}
          </Space>
        ),
      });
    }
  };
  const toolbarContent = (
    <Space direction="vertical">
      <ColorPicker value={color} onChange={setColor} disabled={quickSaving || !!quickError} />
      <Space>
        <Button
          icon={<HighlightOutlined />}
          aria-label="Highlight selection"
          loading={quickSaving}
          onClick={() => void quickSave()}
        >
          Highlight selection
        </Button>
        <Button
          disabled={quickSaving || !!quickError}
          onClick={() => selected && open(undefined, selected)}
        >
          Add a note
        </Button>
      </Space>
      {quickError && (
        <Alert
          type="error"
          message={quickError}
          action={<Button onClick={() => void quickSave()}>Retry save</Button>}
        />
      )}
      <Typography.Text type="secondary">
        Selection is limited to this page. Escape to dismiss.
      </Typography.Text>
    </Space>
  );
  const toolbar = (
    <>
      <Button onClick={() => open()}>New book note</Button>
      {selected && !editor && (
        <Popover
          open
          content={toolbarContent}
          placement="top"
          getPopupContainer={() => document.body}
        >
          <span
            style={{
              position: 'fixed',
              left: Math.min(Math.max(selected.anchor?.x || 180, 180), window.innerWidth - 180),
              top: Math.max(selected.anchor?.y || 180, 175),
              width: 1,
              height: 1,
            }}
          />
        </Popover>
      )}
      {pageQuery.error && (
        <Alert
          type="error"
          message="Annotations could not be loaded"
          action={<Button onClick={() => void pageQuery.refetch()}>Retry</Button>}
        />
      )}
    </>
  );
  const panel = (
    <AnnotationsPanel
      bookId={bookId}
      onEdit={open}
      onDelete={remove}
      onNew={() => open()}
      onJump={(item) => {
        const target = item.segments?.[0]?.page;
        if (target) {
          onPage(target);
          setJump({ id: item.id, page: target });
        } else open(item);
      }}
    />
  );
  const overlay = (
    <div className="highlight-overlay" aria-hidden="true">
      {pdfPage?.pageNumber === page &&
        visible
          .filter((item) => item.documentVersion === bookId)
          .flatMap(
            (item) =>
              item.segments
                ?.filter((s) => s.page === page)
                .flatMap((segment) =>
                  segment.rectangles.map((rect, index) => {
                    const r = viewportRectangle(rect, pdfPage, item.coordinateVersion!);
                    return (
                      <span
                        key={`${item.id}-${index}`}
                        data-highlight-id={item.id}
                        className={`saved-highlight ${emphasis === item.id ? 'annotation-emphasis' : ''}`}
                        style={{
                          background: item.color!,
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.width * 100}%`,
                          height: `${r.height * 100}%`,
                        }}
                      />
                    );
                  }),
                ) || [],
          )}
    </div>
  );
  const dialog = (
    <Modal
      title={
        editor?.item
          ? 'Annotation details'
          : editor?.selection
            ? 'Note on selected text'
            : 'New book note'
      }
      open={!!editor}
      onCancel={close}
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            aria-label={saving ? 'Saving annotation' : failure && !conflict ? 'Retry save' : 'Save'}
            type="primary"
            loading={saving}
            disabled={
              conflict ||
              (!editor?.selection && editor?.item?.kind !== 'HIGHLIGHT' && !draft.trim())
            }
            onClick={() => void save()}
          >
            {failure && !conflict ? 'Retry save' : 'Save'}
          </Button>
        </Space>
      }
    >
      {(editor?.item?.selectedText || editor?.selection?.text) && (
        <blockquote className="annotation-quote">
          {editor.item?.selectedText || editor.selection?.text}
        </blockquote>
      )}
      {(editor?.selection || editor?.item?.kind === 'HIGHLIGHT') && (
        <ColorPicker
          value={editColor}
          onChange={setEditColor}
          disabled={saving || !!pendingCreate}
        />
      )}
      <label htmlFor="annotation-note">Personal note (plain text, up to 5,000 characters)</label>
      <Input.TextArea
        id="annotation-note"
        aria-label="Personal note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={5000}
        showCount
        autoSize={{ minRows: 5, maxRows: 12 }}
        disabled={saving}
        readOnly={!!pendingCreate}
      />
      {editor?.item?.kind === 'HIGHLIGHT' && (
        <Button disabled={saving} onClick={() => setDraft('')}>
          Remove attached note
        </Button>
      )}
      <div role="status" className="annotation-status">
        {saving
          ? 'Saving…'
          : failure
            ? 'Save failed. Your draft is preserved.'
            : dirty
              ? 'Unsaved changes'
              : editor?.item
                ? 'Saved'
                : ''}
      </div>
      {failure && (
        <Alert
          type="error"
          message={failure}
          action={
            conflict && editor?.item ? (
              <Button onClick={() => void loadLatest()}>Load latest version</Button>
            ) : undefined
          }
        />
      )}
      {latest && (
        <Alert
          type="warning"
          message="Review the latest saved note before retrying"
          description={
            <>
              <p className="annotation-quote">{latest.noteText || '(No attached note)'}</p>
              <p>
                Saved color: {annotationColors.find((c) => c[1] === latest.color)?.[0] || 'None'}
              </p>
              <Button
                onClick={() => {
                  setEditor((current) =>
                    current
                      ? { ...current, item: latest, initialColor: latest.color || color }
                      : null,
                  );
                  setLatest(null);
                  setConflict(false);
                  setFailure('');
                }}
              >
                Keep my draft and use latest version
              </Button>
            </>
          }
        />
      )}
    </Modal>
  );
  return { toolbar, panel, overlay, dialog, hitTest, editorOpen: !!editor };
}
