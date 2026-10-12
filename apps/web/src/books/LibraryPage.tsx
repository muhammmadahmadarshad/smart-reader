import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Progress,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  PlusOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Book, BookList, formatDate, formatSize } from './types';
import UploadDialog from './UploadDialog';
export default function LibraryPage() {
  const query = useQueryClient();
  const { message, modal } = App.useApp();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState('added');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('grid');
  const [upload, setUpload] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [form] = Form.useForm();
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const books = useQuery({
    queryKey: ['books', term, sort, page],
    queryFn: () =>
      api<BookList>(
        `/books?${new URLSearchParams({ search: term, sort, page: String(page), pageSize: '12' })}`,
      ),
  });
  useEffect(() => {
    if (books.data && page > 1 && !books.data.items.length)
      setPage(Math.max(1, Math.ceil(books.data.total / 12)));
  }, [books.data, page]);
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api(`/books/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    onSuccess: () => {
      void query.invalidateQueries({ queryKey: ['books'] });
      setEditing(null);
      message.success('Book renamed.');
    },
    onError: (error) => message.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/books/${id}`, { method: 'DELETE' }),
    onSettled: () => query.invalidateQueries({ queryKey: ['books'] }),
  });
  function deleteBook(book: Book) {
    modal.confirm({
      title: 'Delete this book?',
      content: `“${book.title}” and its reading progress and bookmarks will be permanently removed.`,
      okText: 'Delete book',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove.mutateAsync(book.id);
          message.success('Book deleted.');
        } catch (error) {
          message.error((error as Error).message);
          throw error;
        }
      },
    });
  }
  const actions = (book: Book) => (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          ...(book.status === 'READY'
            ? [
                {
                  key: 'rename',
                  label: 'Rename',
                  icon: <EditOutlined />,
                  onClick: () => {
                    setEditing(book);
                    form.setFieldsValue({ title: book.title });
                  },
                },
              ]
            : []),
          {
            key: 'delete',
            label: book.status === 'DELETING' ? 'Retry deletion' : 'Delete',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => deleteBook(book),
          },
        ],
      }}
    >
      <Button type="text" icon={<EllipsisOutlined />} aria-label={`Actions for ${book.title}`} />
    </Dropdown>
  );
  const progress = (book: Book) =>
    book.progress && book.pageCount ? (
      <div className="book-progress">
        <Progress percent={Math.round((book.progress.page / book.pageCount) * 100)} size="small" />
        <Typography.Text type="secondary">
          Page {book.progress.page} of {book.pageCount}
        </Typography.Text>
      </div>
    ) : (
      <Typography.Text type="secondary">Not started</Typography.Text>
    );
  const open = (book: Book) => <Link to={`/books/${book.id}/read`}>{book.title}</Link>;
  return (
    <section className="library-page">
      <div className="library-heading">
        <div>
          <p className="eyebrow">YOUR PERSONAL COLLECTION</p>
          <Typography.Title level={1}>My library</Typography.Title>
          <Typography.Paragraph type="secondary">
            A familiar place for your next chapter.
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUpload(true)}>
          Add a book
        </Button>
      </div>
      <div className="library-toolbar">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search your books"
          aria-label="Search books"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={200}
        />
        <Select
          aria-label="Sort books"
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={[
            { value: 'added', label: 'Recently added' },
            { value: 'opened', label: 'Recently opened' },
            { value: 'title', label: 'Title A–Z' },
          ]}
        />
        <Segmented
          aria-label="Library view"
          value={view}
          onChange={setView}
          options={[
            { value: 'grid', icon: <AppstoreOutlined />, label: 'Grid view' },
            { value: 'list', icon: <UnorderedListOutlined />, label: 'List view' },
          ]}
        />
      </div>
      {books.isPending ? (
        <Row gutter={[24, 24]}>
          {[1, 2, 3, 4].map((n) => (
            <Col key={n} xs={24} sm={12} lg={6}>
              <Card>
                <Skeleton active />
              </Card>
            </Col>
          ))}
        </Row>
      ) : books.error ? (
        <Alert
          showIcon
          type="error"
          message="Could not load your library"
          description={books.error.message}
          action={<Button onClick={() => books.refetch()}>Retry</Button>}
        />
      ) : !books.data?.items.length ? (
        <div className="library-empty">
          <Empty
            image={<BookOutlined style={{ fontSize: 64, color: '#35654D' }} />}
            description={
              <>
                <Typography.Title level={3}>
                  {term ? 'No matching books' : 'Every library starts with one book'}
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  {term
                    ? 'Try another title or clear your search.'
                    : 'Add a PDF and make yourself at home.'}
                </Typography.Paragraph>
              </>
            }
          >
            <Button
              type={term ? 'default' : 'primary'}
              onClick={() => (term ? setSearch('') : setUpload(true))}
            >
              {term ? 'Clear search' : 'Add your first book'}
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {books.data.total} {books.data.total === 1 ? 'book' : 'books'}
          </Typography.Paragraph>
          {view === 'grid' ? (
            <Row gutter={[24, 24]}>
              {books.data.items.map((book) => (
                <Col key={book.id} xs={24} sm={12} lg={8} xl={6}>
                  <Card
                    className="book-card"
                    cover={
                      <div className="book-cover" aria-hidden="true">
                        <div className="cover-spine" />
                        <BookOutlined />
                        <span>SMART READER LIBRARY</span>
                        <strong>{book.title}</strong>
                        <div className="cover-rule" />
                        <small>PDF · {book.pageCount} pages</small>
                      </div>
                    }
                  >
                    <div className="book-title-row">
                      <Typography.Title level={4} ellipsis={{ rows: 2 }} title={book.title}>
                        {book.status === 'READY' ? open(book) : book.title}
                      </Typography.Title>
                      {actions(book)}
                    </div>
                    <Typography.Paragraph type="secondary">
                      {formatSize(book.size)} · Added {formatDate(book.createdAt)}
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary">
                      {book.lastOpenedAt
                        ? `Last opened ${formatDate(book.lastOpenedAt)}`
                        : 'Not opened yet'}
                    </Typography.Paragraph>
                    {book.status === 'READY' ? (
                      progress(book)
                    ) : (
                      <Tag color={book.status === 'FAILED' ? 'error' : 'default'}>
                        {book.status === 'DELETING'
                          ? 'Deletion pending'
                          : book.status === 'FAILED'
                            ? 'Upload failed'
                            : 'Processing upload'}
                      </Tag>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <Table
              rowKey="id"
              pagination={false}
              dataSource={books.data.items}
              scroll={{ x: 700 }}
              columns={[
                {
                  title: 'Book',
                  dataIndex: 'title',
                  render: (_, book) =>
                    book.status === 'READY' ? (
                      open(book)
                    ) : (
                      <>
                        {book.title} <Tag>{book.status.toLowerCase()}</Tag>
                      </>
                    ),
                },
                { title: 'Size', dataIndex: 'size', render: formatSize },
                { title: 'Added', dataIndex: 'createdAt', render: formatDate },
                { title: 'Last opened', dataIndex: 'lastOpenedAt', render: formatDate },
                { title: 'Progress', render: (_, book) => progress(book), width: 160 },
                { title: '', render: (_, book) => actions(book), width: 60 },
              ]}
            />
          )}
          <Pagination
            className="library-pagination"
            current={page}
            pageSize={12}
            total={books.data.total}
            onChange={setPage}
            showSizeChanger={false}
            hideOnSinglePage
          />
        </>
      )}
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
      <Modal
        title="Rename book"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={rename.isPending}
        okText="Save title"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={({ title }) =>
            editing && rename.mutate({ id: editing.id, title: title.trim() })
          }
        >
          <Form.Item
            label="Book title"
            name="title"
            rules={[{ required: true, whitespace: true, message: 'Enter a title.' }, { max: 200 }]}
          >
            <Input maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}
