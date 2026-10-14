import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  Pagination,
  Segmented,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Annotation, AnnotationList } from './types';
export const annotationColors = [
  ['Yellow', '#F5E6A8'],
  ['Sage', '#CFE3C6'],
  ['Peach', '#F3D0B5'],
  ['Rose', '#ECCBD3'],
];
export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <Space size={6} role="group" aria-label="Highlight color">
      {annotationColors.map(([name, color]) => (
        <Tooltip key={color} title={name}>
          <Button
            aria-label={`${name} highlight color`}
            aria-pressed={value === color}
            disabled={disabled}
            onClick={() => onChange(color)}
            style={{
              background: color,
              color: '#292D28',
              border: value === color ? '2px solid #35654D' : '1px solid #62685F',
              width: 36,
            }}
            icon={value === color ? <CheckOutlined /> : undefined}
          />
        </Tooltip>
      ))}
    </Space>
  );
}
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
  const [filter, setFilter] = useState('all'),
    [search, setSearch] = useState(''),
    [color, setColor] = useState<string>(),
    [sort, setSort] = useState('page'),
    [page, setPage] = useState(1);
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
    queryFn: () => api<AnnotationList>(`/books/${bookId}/annotations?${params}`),
  });
  useEffect(() => {
    if (result.data && page > 1 && !result.data.items.length)
      setPage(Math.max(1, Math.ceil(result.data.total / 20)));
  }, [result.data, page]);
  return (
    <section className="annotations-panel" aria-label="Notes and highlights">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button onClick={onNew}>New book note</Button>
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
        <Input.Search
          aria-label="Search annotations"
          placeholder="Search passages and notes"
          allowClear
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
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
          style={{ width: '100%' }}
        />
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
          style={{ width: '100%' }}
        />
        {result.isPending ? (
          <Spin />
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
                  <Empty description="No annotations found. Select a passage or create a book note." />
                ),
              }}
              renderItem={(item) => (
                <List.Item className="annotation-entry" key={item.id}>
                  <div style={{ width: '100%' }}>
                    <Button className="annotation-link" type="text" onClick={() => onJump(item)}>
                      <span
                        className="annotation-swatch"
                        role="img"
                        aria-label={
                          annotationColors.find((c) => c[1] === item.color)?.[0] || 'Book note'
                        }
                        style={{ background: item.color || 'transparent' }}
                      />
                      {item.segments
                        ? `Page ${item.segments.map((s) => s.page).join(', ')}`
                        : 'Standalone book note'}
                    </Button>
                    {item.selectedText && <p className="annotation-preview">{item.selectedText}</p>}
                    {item.noteText && <p className="annotation-preview">{item.noteText}</p>}
                    <Typography.Text type="secondary">
                      {new Date(item.updatedAt).toLocaleString()}
                    </Typography.Text>
                    <Space>
                      <Button
                        aria-label={`Edit annotation ${item.selectedText?.slice(0, 40) || 'book note'}`}
                        icon={<EditOutlined />}
                        onClick={() => onEdit(item)}
                      />
                      <Button
                        danger
                        aria-label={`Delete annotation ${item.selectedText?.slice(0, 40) || 'book note'}`}
                        icon={<DeleteOutlined />}
                        onClick={() => onDelete(item)}
                      />
                    </Space>
                  </div>
                </List.Item>
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
      </Space>
    </section>
  );
}
