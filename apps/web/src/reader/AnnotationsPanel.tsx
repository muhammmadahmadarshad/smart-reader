import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Pagination,
  Popover,
  Segmented,
  Select,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Annotation, AnnotationList } from './types';
import { annotationColors } from './AnnotationColors';

export default function AnnotationsPanel({
  bookId,
  onEdit,
  onDelete,
  onJump,
  onNew,
}: {
  bookId: string;
  onEdit: (item: Annotation) => void;
  onDelete: (item: Annotation) => void;
  onJump: (item: Annotation) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [color, setColor] = useState<string>();
  const [sort, setSort] = useState('page');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    filter,
    search,
    sort,
    page: String(page),
    pageSize: '20',
    ...(color ? { color } : {}),
  });
  const result = useQuery({
    queryKey: ['annotations', bookId, 'list', params.toString()],
    placeholderData: keepPreviousData,
    queryFn: () => api<AnnotationList>(`/books/${bookId}/annotations?${params}`),
  });
  useEffect(() => {
    if (result.data && page > 1 && !result.data.items.length)
      setPage(Math.max(1, Math.ceil(result.data.total / 20)));
  }, [result.data, page]);

  const filtersActive = filter !== 'all' || !!color || sort !== 'page';
  const filterOptions = (
    <div className="annotation-filters">
      <Typography.Text strong>Show</Typography.Text>
      <Segmented
        block
        aria-label="Annotation type"
        value={filter}
        options={[
          { label: 'All', value: 'all' },
          { label: 'Highlights', value: 'highlights' },
          { label: 'Notes', value: 'notes' },
        ]}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
      />
      <Typography.Text strong>Highlight color</Typography.Text>
      <Select
        aria-label="Filter highlight color"
        placeholder="All colors"
        allowClear
        value={color}
        onChange={(value) => {
          setColor(value);
          setPage(1);
        }}
        options={annotationColors.map(([label, value]) => ({ label, value }))}
      />
      <Typography.Text strong>Sort by</Typography.Text>
      <Select
        aria-label="Sort annotations"
        value={sort}
        onChange={(value) => {
          setSort(value);
          setPage(1);
        }}
        options={[
          { label: 'Page order', value: 'page' },
          { label: 'Recently updated', value: 'updated' },
        ]}
      />
      {filtersActive && (
        <Button
          type="link"
          onClick={() => {
            setFilter('all');
            setColor(undefined);
            setSort('page');
            setPage(1);
          }}
        >
          Reset filters
        </Button>
      )}
    </div>
  );

  return (
    <section className="annotations-panel" aria-label="Notes and highlights">
      <div className="notes-header">
        <div className="notes-heading">
          <Typography.Text strong>Your notes</Typography.Text>
          <Button type="primary" aria-label="New book note" icon={<PlusOutlined />} onClick={onNew}>
            New note
          </Button>
        </div>
        <div className="notes-search">
          <Input.Search
            aria-label="Search annotations"
            placeholder="Find a note or passage"
            allowClear
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Popover trigger="click" placement="bottomRight" content={filterOptions}>
            <Button
              aria-label="Filter notes"
              aria-pressed={filtersActive}
              type={filtersActive ? 'primary' : 'default'}
              icon={<FilterOutlined />}
            />
          </Popover>
        </div>
        {filtersActive && (
          <div className="notes-filter-summary" role="status">
            {[
              filter === 'all' ? 'All types' : filter,
              annotationColors.find((entry) => entry[1] === color)?.[0],
              sort === 'updated' ? 'Recently updated' : 'Page order',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>
      <div className="notes-content" aria-busy={result.isFetching}>
        {result.isPending ? (
          <div className="panel-loading">
            <Spin />
          </div>
        ) : result.error ? (
          <Alert
            type="error"
            message={result.error.message}
            action={<Button onClick={() => void result.refetch()}>Retry</Button>}
          />
        ) : (
          <>
            <List
              dataSource={result.data.items}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <>
                        <Typography.Text strong>
                          {search || filtersActive ? 'No matching notes' : 'Keep what matters'}
                        </Typography.Text>
                        <p>
                          {search || filtersActive
                            ? 'Try a different search or clear your filters.'
                            : 'Select a passage to highlight it or add a note. Use New note for a thought about the book.'}
                        </p>
                      </>
                    }
                  />
                ),
              }}
              renderItem={(item) => (
                <AnnotationCard item={item} onEdit={onEdit} onDelete={onDelete} onJump={onJump} />
              )}
            />
            <Pagination
              simple
              current={page}
              pageSize={20}
              total={result.data.total}
              onChange={setPage}
              hideOnSinglePage
            />
          </>
        )}
      </div>
    </section>
  );
}

function AnnotationCard({
  item,
  onEdit,
  onDelete,
  onJump,
}: {
  item: Annotation;
  onEdit: (item: Annotation) => void;
  onDelete: (item: Annotation) => void;
  onJump: (item: Annotation) => void;
}) {
  const annotationLabel = item.selectedText?.slice(0, 40) || 'book note';
  const pageLabel = item.segments
    ? 'Page ' + item.segments.map((segment) => segment.page).join(', ')
    : 'Standalone book note';
  return (
    <List.Item className="annotation-entry">
      <div className="annotation-card">
        <div className="annotation-card-header">
          <Button className="annotation-link" type="text" onClick={() => onJump(item)}>
            <span
              className="annotation-swatch"
              role="img"
              aria-label={
                annotationColors.find((entry) => entry[1] === item.color)?.[0] || 'Book note'
              }
              style={{ background: item.color || 'transparent' }}
            />
            {pageLabel}
          </Button>
          <div className="annotation-card-actions">
            <Tooltip title="Edit note">
              <Button
                size="small"
                type="text"
                aria-label={'Edit annotation ' + annotationLabel}
                icon={<EditOutlined />}
                onClick={() => onEdit(item)}
              />
            </Tooltip>
            <Tooltip title="Delete note">
              <Button
                size="small"
                type="text"
                aria-label={'Delete annotation ' + annotationLabel}
                icon={<DeleteOutlined />}
                onClick={() => onDelete(item)}
              />
            </Tooltip>
          </div>
        </div>
        {item.selectedText && (
          <blockquote
            className="annotation-preview annotation-source"
            style={{ borderLeftColor: item.color || undefined }}
          >
            {item.selectedText}
          </blockquote>
        )}
        {item.noteText && (
          <p className="annotation-preview annotation-personal-note">{item.noteText}</p>
        )}
        <time className="annotation-date" dateTime={item.updatedAt}>
          {new Date(item.updatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </time>
      </div>
    </List.Item>
  );
}
