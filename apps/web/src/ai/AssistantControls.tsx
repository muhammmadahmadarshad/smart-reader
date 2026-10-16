import { Alert, Button, Popover, Select, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, DownOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { BookAssistant } from './useBookAssistant';

/** Keep the conversation in focus. Model selection and history open only on request. */
export default function AssistantControls({ assistant }: { assistant: BookAssistant }) {
  const {
    capabilities,
    connections,
    connection,
    connectionId,
    model,
    selectModel,
    conversations,
    conversationId,
    running,
    valid,
    openConversation,
    startConversation,
    deleteConversation,
  } = assistant;

  const modelOptions = (
    <div className="ai-options">
      <Typography.Text strong>Connection and model</Typography.Text>
      <Select
        aria-label="AI connection"
        placeholder="Choose connection"
        value={connectionId || undefined}
        options={connections.data?.map((item) => ({ value: item.id, label: item.name }))}
        onChange={(id) => {
          const selectedConnection = connections.data?.find((item) => item.id === id);
          if (selectedConnection) selectModel(id, selectedConnection.model);
        }}
      />
      <Select
        aria-label="Chat model"
        placeholder="Choose a validated model"
        value={model || undefined}
        options={connection?.validatedModels.map((name) => ({ value: name, label: name }))}
        onChange={(name) => selectModel(connectionId, name)}
      />
      <Typography.Paragraph type="secondary">
        Changes apply to your next question. The selected provider receives relevant passages and
        conversation context. Hosted generation charges belong to your provider account.
      </Typography.Paragraph>
      <Link to="/ai-settings">Manage connections</Link>
    </div>
  );

  const conversationHistory = (
    <div className="ai-options">
      <Typography.Text strong>Conversation history</Typography.Text>
      <Select
        aria-label="Conversation"
        placeholder="Open a conversation"
        value={conversationId || undefined}
        disabled={running}
        options={conversations.data?.map((item) => ({ value: item.id, label: item.title }))}
        onChange={openConversation}
      />
      <Button
        danger
        icon={<DeleteOutlined />}
        disabled={!conversationId || running}
        onClick={deleteConversation}
      >
        Delete conversation
      </Button>
    </div>
  );

  return (
    <>
      <div className="ai-heading">
        <Typography.Text strong>Assistant</Typography.Text>
        <Space size={2}>
          <Popover trigger="click" content={conversationHistory} placement="bottomRight">
            <Button type="text" aria-label="Conversation history" icon={<HistoryOutlined />}>
              History
            </Button>
          </Popover>
          <Tooltip title="New conversation">
            <Button
              type="text"
              aria-label="New conversation"
              icon={<PlusOutlined />}
              disabled={running || !valid}
              onClick={startConversation}
            />
          </Tooltip>
        </Space>
      </div>
      {capabilities.isError && (
        <Alert
          type="warning"
          message="Could not load AI availability"
          action={
            <Button size="small" onClick={() => void capabilities.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {!capabilities.isPending && !capabilities.isError && !capabilities.data?.generation ? (
        <div className="ai-connection-prompt">
          <p>{capabilities.data?.reason || 'Connect your provider to ask questions.'}</p>
          <Link to="/ai-settings">Add connection →</Link>
        </div>
      ) : (
        <>
          <Popover trigger="click" placement="bottomLeft" content={modelOptions}>
            <Button className="ai-model-trigger" aria-label="Change AI model" type="text">
              <span>
                {connection?.name || 'Choose connection'}
                {model ? ' · ' + model : ''}
              </span>
              <DownOutlined />
            </Button>
          </Popover>
          {connection && (
            <p className="ai-provider-disclosure">
              Relevant excerpts are sent to {connection.provider}.
            </p>
          )}
        </>
      )}
    </>
  );
}
