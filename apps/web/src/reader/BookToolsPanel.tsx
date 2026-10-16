import { useEffect, useMemo, useState } from 'react';
import { App, Tabs, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BookmarksPanel from './BookmarksPanel';
import SearchPanel from './SearchPanel';

type OutlineItems = Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | null;

export default function BookToolsPanel({
  bookId,
  pdf,
  onPage,
}: {
  bookId: string;
  pdf: PDFDocumentProxy | null;
  onPage: (page: number) => void;
}) {
  const { message } = App.useApp();
  const [outline, setOutline] = useState<OutlineItems>(null);

  useEffect(() => {
    let disposed = false;
    if (pdf)
      void pdf
        .getOutline()
        .then((items) => {
          if (!disposed) setOutline(items);
        })
        .catch(() => {
          if (!disposed) setOutline(null);
        });
    return () => {
      disposed = true;
    };
  }, [pdf]);

  const outlineTree = useMemo(() => {
    const destinations = new Map<string, NonNullable<OutlineItems>[number]['dest']>();
    function toTree(items: NonNullable<OutlineItems>, parentKey = ''): DataNode[] {
      return items.map((item, index) => {
        const key = parentKey + index;
        destinations.set(key, item.dest);
        return { key, title: item.title, children: toTree(item.items, key + '.') };
      });
    }
    return { nodes: outline ? toTree(outline) : [], destinations };
  }, [outline]);

  async function openOutlineDestination(key: string) {
    if (!pdf) return;
    try {
      let destination = outlineTree.destinations.get(key);
      if (typeof destination === 'string') destination = await pdf.getDestination(destination);
      if (!destination) return;
      const reference = destination[0];
      const pageIndex =
        typeof reference === 'number' ? reference : await pdf.getPageIndex(reference);
      onPage(pageIndex + 1);
    } catch {
      message.warning('This outline destination could not be opened.');
    }
  }

  return (
    <Tabs
      size="small"
      className="book-tools-panel"
      items={[
        {
          key: 'bookmarks',
          label: 'Bookmarks',
          children: <BookmarksPanel bookId={bookId} onPage={onPage} />,
        },
        { key: 'search', label: 'Search', children: <SearchPanel pdf={pdf} onPage={onPage} /> },
        ...(outline?.length
          ? [
              {
                key: 'outline',
                label: 'Outline',
                children: (
                  <Tree
                    treeData={outlineTree.nodes}
                    onSelect={(keys) => {
                      if (keys[0] !== undefined) void openOutlineDestination(String(keys[0]));
                    }}
                  />
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
