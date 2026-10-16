import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Capability, Connection } from './assistant-types';
export default function AiSettings() {
  const { message, modal } = App.useApp(),
    query = useQueryClient();
  const connections = useQuery({
    queryKey: ['ai-connections'],
    queryFn: () => api<Connection[]>('/ai/connections'),
  });
  const capabilities = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<Capability>('/ai/capabilities'),
  });
  const [editing, setEditing] = useState<Connection | null | undefined>(undefined),
    [busy, setBusy] = useState(false),
    [removeKey, setRemoveKey] = useState(false),
    [models, setModels] = useState<Record<string, string[]>>({}),
    [validationModels, setValidationModels] = useState<Record<string, string>>({});
  const [form] = Form.useForm();
  const provider = Form.useWatch('provider', form);
  const refresh = () => {
    void query.invalidateQueries({ queryKey: ['ai-connections'] });
    void query.invalidateQueries({ queryKey: ['ai-capabilities'] });
  };
  const close = () => {
    form.resetFields();
    setEditing(undefined);
    setRemoveKey(false);
  };
  const open = (connection: Connection | null) => {
    setEditing(connection);
    setRemoveKey(false);
    form.resetFields();
    form.setFieldsValue(
      connection
        ? {
            name: connection.name,
            provider: connection.provider,
            model: connection.model,
            baseUrl: ['ollama', 'compatible'].includes(connection.provider)
              ? connection.baseUrl
              : undefined,
            streaming: connection.streaming,
          }
        : { provider: 'openai', streaming: true },
    );
  };
  async function save() {
    try {
      const values = await form.validateFields();
      setBusy(true);
      await api(`/ai/connections${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...values,
          baseUrl: ['ollama', 'compatible'].includes(values.provider) ? values.baseUrl : undefined,
          apiKey: removeKey ? '' : values.apiKey || undefined,
        }),
      });
      close();
      refresh();
      message.success('Connection saved. Validate the model before using it.');
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  const validate = (c: Connection) =>
    modal.confirm({
      title: 'Validate this model?',
      content: `This sends a short test request to ${c.provider} using your provider account. Provider charges may apply.`,
      okText: 'Validate connection',
      onOk: async () => {
        try {
          await api(`/ai/connections/${c.id}/validate`, {
            method: 'POST',
            body: JSON.stringify({ model: validationModels[c.id] || c.model }),
          });
          refresh();
          message.success('Text-generation connection validated.');
        } catch (error) {
          message.error((error as Error).message);
        }
      },
    });
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <Typography.Title level={2}>AI Settings</Typography.Title>
      <Typography.Paragraph>
        Use your own account for answers. Relevant book excerpts and conversation context are sent
        to the provider you select. Hosted model charges belong to your provider account.
        Project-managed embeddings are separate and subject to application quotas.
      </Typography.Paragraph>
      {!capabilities.data?.connectionsEnabled && (
        <Alert
          type="warning"
          showIcon
          message={capabilities.data?.reason || 'Loading AI availability…'}
        />
      )}
      <Button
        type="primary"
        style={{ margin: '16px 0' }}
        disabled={!capabilities.data?.connectionsEnabled}
        onClick={() => open(null)}
      >
        Add connection
      </Button>
      {connections.error && <Alert type="error" message={connections.error.message} />}
      <Space direction="vertical" style={{ width: '100%' }}>
        {connections.data?.map((c) => (
          <Card
            key={c.id}
            title={
              <Space>
                {c.name}
                <Tag color={c.validation === 'VALID' ? 'green' : 'default'}>{c.validation}</Tag>
              </Space>
            }
          >
            <Typography.Paragraph>
              {c.provider} · {c.baseUrl}
              <br />
              Key: {c.keySuffix ? `••••${c.keySuffix}` : 'No key'} ·{' '}
              {c.streaming ? 'Streaming enabled' : 'Completed responses'}
              {c.validatedAt && (
                <>
                  <br />
                  Last validation: {new Date(c.validatedAt).toLocaleString()}
                </>
              )}
            </Typography.Paragraph>
            <Space wrap>
              <Select
                aria-label={`Model for ${c.name}`}
                showSearch
                style={{ minWidth: 220 }}
                value={validationModels[c.id] || c.model}
                options={[...new Set([c.model, ...c.validatedModels, ...(models[c.id] || [])])].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(value) => setValidationModels({ ...validationModels, [c.id]: value })}
              />
              <Input
                aria-label={`Manual model for ${c.name}`}
                placeholder="Exact model identifier"
                value={validationModels[c.id] ?? ''}
                onChange={(e) =>
                  setValidationModels({ ...validationModels, [c.id]: e.target.value })
                }
              />
              <Button
                onClick={async () => {
                  try {
                    setModels({
                      ...models,
                      [c.id]: await api<string[]>(`/ai/connections/${c.id}/models`),
                    });
                  } catch (error) {
                    message.error((error as Error).message);
                  }
                }}
              >
                Discover models
              </Button>
              <Button onClick={() => validate(c)}>Validate model</Button>
              <Button onClick={() => open(c)}>Edit / replace key</Button>
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: `Remove ${c.name}?`,
                    content:
                      'This stops future use and requests cancellation of active work. It does not revoke the key at the provider.',
                    okText: 'Remove',
                    onOk: async () => {
                      await api(`/ai/connections/${c.id}`, { method: 'DELETE' });
                      refresh();
                    },
                  })
                }
              >
                Remove
              </Button>
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
              Discovery may include models that do not support text generation. Validate the exact
              model before selecting it in the reader. If streaming is unsupported, turn it off and
              validate again.
            </Typography.Paragraph>
          </Card>
        ))}
      </Space>
      <Modal
        open={editing !== undefined}
        title={editing ? 'Edit connection' : 'Add connection'}
        okText="Save connection"
        onCancel={close}
        onOk={() => void save()}
        confirmLoading={busy}
        forceRender
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Connection name" rules={[{ required: true, max: 80 }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'openai', label: 'OpenAI' },
                { value: 'anthropic', label: 'Anthropic Claude' },
                { value: 'gemini', label: 'Google Gemini' },
                { value: 'ollama', label: 'Ollama' },
                { value: 'compatible', label: 'OpenAI-compatible endpoint' },
              ]}
            />
          </Form.Item>
          {['ollama', 'compatible'].includes(provider) && (
            <>
              <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }]}>
                <Input
                  placeholder={
                    provider === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://your-inference-host/v1'
                  }
                />
              </Form.Item>
              <Alert
                type="info"
                message="Localhost refers to the NestJS server, not your laptop. Private endpoints require an administrator allowlist. Remote endpoints require HTTPS."
              />
            </>
          )}
          <Form.Item
            name="model"
            label="Default model identifier"
            rules={[{ required: true, max: 150 }]}
          >
            <Input placeholder="Enter the exact identifier from your provider" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={
              editing
                ? 'Replacement key (blank keeps the saved key)'
                : 'API key (optional for trusted keyless endpoints)'
            }
          >
            <Input.Password autoComplete="new-password" disabled={removeKey} />
          </Form.Item>
          {editing && (
            <Checkbox checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)}>
              Remove saved key
            </Checkbox>
          )}
          <Form.Item name="streaming" label="Streaming responses" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
