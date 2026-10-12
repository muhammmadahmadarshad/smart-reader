import { useEffect, useRef, useState } from 'react';
import { Alert, App, Modal, Progress, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
export default function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const query = useQueryClient();
  const { message } = App.useApp();
  const config = useQuery({
    queryKey: ['upload-config'],
    queryFn: () => api<{ maxUploadBytes: number }>('/books/config'),
  });
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const xhr = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => xhr.current?.abort(), []);
  useEffect(() => {
    if (open) {
      setError('');
      setPercent(null);
      setName('');
    }
  }, [open]);
  const busy = percent !== null;
  return (
    <Modal
      title="Add a book"
      open={open}
      onCancel={onClose}
      footer={null}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
    >
      <Typography.Paragraph type="secondary">
        Keep your next read close. Your PDFs are private to your account.
      </Typography.Paragraph>
      {error && (
        <Alert
          className="form-alert"
          type="error"
          showIcon
          message="Upload failed"
          description={error}
        />
      )}
      <Upload.Dragger
        accept="application/pdf,.pdf"
        maxCount={1}
        showUploadList={false}
        disabled={busy || !config.data}
        beforeUpload={(file) => {
          setError('');
          if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') {
            setError('Choose a PDF file.');
            return Upload.LIST_IGNORE;
          }
          if (file.size > (config.data?.maxUploadBytes || 0)) {
            setError(
              `Choose a PDF smaller than ${(config.data?.maxUploadBytes || 0) / 1048576} MB.`,
            );
            return Upload.LIST_IGNORE;
          }
          return true;
        }}
        customRequest={({ file, onSuccess, onError }) => {
          const request = new XMLHttpRequest();
          xhr.current = request;
          setName((file as File).name);
          setPercent(0);
          request.open('POST', '/api/books');
          request.setRequestHeader('X-Kevnex-Request', '1');
          request.upload.onprogress = (event) => {
            if (event.lengthComputable) setPercent(Math.round((event.loaded / event.total) * 100));
          };
          const fail = (text: string) => {
            setError(text);
            setPercent(null);
            onError?.(new Error(text));
            void query.invalidateQueries({ queryKey: ['books'] });
          };
          request.onload = () => {
            let body: { message?: string } = {};
            try {
              body = JSON.parse(request.responseText);
            } catch {
              /* A proxy may return a non-JSON error. */
            }
            if (request.status >= 200 && request.status < 300) {
              setPercent(null);
              onSuccess?.(body);
              void query.invalidateQueries({ queryKey: ['books'] });
              message.success('Book added to your library.');
              onClose();
            } else {
              if (request.status === 401) window.dispatchEvent(new Event('session-expired'));
              fail(body.message || 'Upload failed. Please try again.');
            }
          };
          request.onerror = () => fail('The connection was interrupted. Please try again.');
          request.ontimeout = () => fail('The upload timed out. Please try again.');
          request.timeout = 180000;
          const form = new FormData();
          form.append('file', file as File);
          request.send(form);
          return { abort: () => request.abort() };
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Drop a PDF here, or click to browse</p>
        <p className="ant-upload-hint">
          PDF files up to {config.data ? config.data.maxUploadBytes / 1048576 : '…'} MB
        </p>
      </Upload.Dragger>
      {config.error && <Alert type="error" message={config.error.message} />}
      {busy && (
        <div className="upload-progress" role="status">
          <Typography.Text ellipsis>{name}</Typography.Text>
          <Progress percent={percent} status="active" />
          <Typography.Text type="secondary">
            {percent === 100 ? 'Checking and saving your PDF…' : 'Uploading your book…'}
          </Typography.Text>
        </div>
      )}
    </Modal>
  );
}
