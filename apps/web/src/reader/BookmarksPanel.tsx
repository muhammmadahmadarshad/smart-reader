import { useState } from 'react';
import { Alert, App, Button, Empty, Form, Input, List, Modal, Space, Spin, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Bookmark } from './types';
export default function BookmarksPanel({
  bookId,
  onPage,
}: {
  bookId: string;
  onPage: (page: number) => void;
}) {
  const query = useQueryClient();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [form] = Form.useForm();
  const bookmarks = useQuery({
    queryKey: ['bookmarks', bookId],
    queryFn: () => api<Bookmark[]>(`/books/${bookId}/bookmarks`),
  });
  const mutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label?: string }) =>
      api(`/books/${bookId}/bookmarks/${id}`, {
        method: label === undefined ? 'DELETE' : 'PATCH',
        ...(label === undefined ? {} : { body: JSON.stringify({ label }) }),
      }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ['bookmarks', bookId] });
      setEditing(null);
    },
    onError: (error) => message.error(error.message),
  });
  if (bookmarks.isPending) return <Spin />;
  if (bookmarks.error)
    return (
      <Alert
        type="error"
        message={bookmarks.error.message}
        action={<Button onClick={() => bookmarks.refetch()}>Retry</Button>}
      />
    );
  return (
    <>
      <List
        dataSource={bookmarks.data}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Save a page using the bookmark button above."
            />
          ),
        }}
        renderItem={(bookmark) => (
          <List.Item>
            <div className="bookmark-item">
              <Button type="link" onClick={() => onPage(bookmark.page)}>
                {bookmark.label}
              </Button>
              <Typography.Text type="secondary">Page {bookmark.page}</Typography.Text>
            </div>
            <Space size={0}>
              <Button
                type="text"
                aria-label={`Rename bookmark ${bookmark.label}`}
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(bookmark);
                  form.setFieldsValue({ label: bookmark.label });
                }}
              />
              <Button
                type="text"
                danger
                aria-label={`Remove bookmark ${bookmark.label}`}
                icon={<DeleteOutlined />}
                onClick={() =>
                  modal.confirm({
                    title: 'Remove bookmark?',
                    content: bookmark.label,
                    okText: 'Remove',
                    onOk: () => mutation.mutateAsync({ id: bookmark.id }),
                  })
                }
              />
            </Space>
          </List.Item>
        )}
      />
      <Modal
        title="Rename bookmark"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={mutation.isPending}
        okText="Save bookmark"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={({ label }) =>
            editing && mutation.mutate({ id: editing.id, label: label.trim() })
          }
        >
          <Form.Item
            name="label"
            label="Bookmark name"
            rules={[
              { required: true, whitespace: true, message: 'Enter a bookmark name.' },
              { max: 120 },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
