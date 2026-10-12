import { Alert, App, Button, Empty, List, Spin, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Highlight } from './types';

export function useHighlights(bookId: string, page: number) {
  return useQuery({
    queryKey: ['highlights', bookId, page],
    queryFn: () => api<Highlight[]>(`/books/${bookId}/highlights?page=${page}`),
  });
}
export default function HighlightsPanel({ bookId, page }: { bookId: string; page: number }) {
  const highlights = useHighlights(bookId, page);
  const query = useQueryClient();
  const { message, modal } = App.useApp();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/books/${bookId}/highlights/${id}`, { method: 'DELETE' }),
    onSuccess: () => query.invalidateQueries({ queryKey: ['highlights', bookId] }),
    onError: (error) => message.error(error.message),
  });
  if (highlights.isPending) return <Spin />;
  if (highlights.error)
    return (
      <Alert
        type="error"
        message={highlights.error.message}
        action={<Button onClick={() => highlights.refetch()}>Retry</Button>}
      />
    );
  return (
    <>
      <Typography.Paragraph type="secondary">
        Highlights on page {page}. Select text on the page, then choose Highlight selection.
      </Typography.Paragraph>
      <List
        dataSource={highlights.data}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No highlights on this page" />
          ),
        }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="remove"
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`Remove highlight ${item.text}`}
                onClick={() =>
                  modal.confirm({
                    title: 'Remove highlight?',
                    content: item.text,
                    okText: 'Remove',
                    onOk: () => remove.mutateAsync(item.id),
                  })
                }
              />,
            ]}
          >
            <Typography.Text className="highlight-quote">{item.text}</Typography.Text>
          </List.Item>
        )}
      />
    </>
  );
}
