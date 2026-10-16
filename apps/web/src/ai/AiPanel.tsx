import { Alert, Button, Input, Tag, Typography } from 'antd';
import { ReadOutlined, SendOutlined } from '@ant-design/icons';
import type { SelectionContextInput, SourceReference } from './types';
import { useAssistantSession } from './BookAssistantSession';
import AssistantControls from './AssistantControls';
import BookPreparation from './BookPreparation';
import SavedAnswer from './SavedAnswer';
import './assistant.css';

type AiPanelProps = {
  selection: SelectionContextInput | null;
  onClear: () => void;
  onSource: (source: SourceReference) => void;
};

export default function AiPanel({ selection, onClear, onSource }: AiPanelProps) {
  const assistant = useAssistantSession();
  const {
    index,
    valid,
    messages,
    running,
    status,
    draft,
    failure,
    question,
    setQuestion,
    history,
    followResponse,
    send,
    cancelResponse,
  } = assistant;
  const canAsk = Boolean(valid && (selection || index.data?.ready));

  return (
    <section className="ai-panel" aria-label="AI book assistant">
      <div className="ai-panel-header">
        <AssistantControls assistant={assistant} />
        {!selection && <BookPreparation assistant={assistant} />}
      </div>
      <div
        className="ai-history"
        ref={history}
        onScroll={() => {
          const element = history.current;
          if (element)
            followResponse.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {!messages.data?.length && !running && !draft && (
          <div className="ai-empty">
            <ReadOutlined />
            <Typography.Title level={5}>
              {selection ? 'Explore this passage' : 'A little clarity, a deeper read'}
            </Typography.Title>
            <p>
              {selection
                ? 'Ask for an explanation, an example, or a different perspective.'
                : 'Select a passage in the book for help understanding it. Prepare the book to ask questions across its pages.'}
            </p>
          </div>
        )}
        {messages.isError && (
          <Alert
            type="warning"
            message="Could not load this conversation"
            action={
              <Button size="small" onClick={() => void messages.refetch()}>
                Retry
              </Button>
            }
          />
        )}
        {messages.data?.map((item) => (
          <SavedAnswer key={item.id} item={item} onSource={onSource} />
        ))}
        {running && (
          <div className="ai-stream">
            <div role="status" className="ai-stream-status">
              <span className="ai-status-dot" />
              {status || 'Working…'} · Incomplete until finished
            </div>
            <div className="ai-draft">{draft}</div>
          </div>
        )}
        {!running && draft && (
          <div className="ai-stream">
            <Tag>Incomplete response</Tag>
            <div className="ai-draft">{draft}</div>
          </div>
        )}
        {failure && (
          <Alert
            type="error"
            message={failure}
            description="Previous messages are preserved. Review before explicitly submitting a new request."
          />
        )}
      </div>
      <div className="ai-composer">
        {selection && (
          <div className="ai-selection">
            <details>
              <summary>Original passage · browser selection (unverified)</summary>
              <blockquote>{selection.selectedText}</blockquote>
            </details>
            <Button type="link" size="small" onClick={onClear}>
              Use book-wide Q&A
            </Button>
          </div>
        )}
        {!canAsk && (
          <p className="ai-composer-hint">
            {!valid
              ? 'Add a validated connection to start.'
              : 'Select text in the book, or prepare it for book-wide questions.'}
          </p>
        )}
        <Input.TextArea
          aria-label="Question for AI"
          value={question}
          maxLength={2000}
          autoSize={{ minRows: 2, maxRows: 5 }}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={selection ? 'Ask about this passage…' : 'Ask a question about this book…'}
          disabled={!canAsk}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="ai-composer-actions">
          <Typography.Text type="secondary">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to send
          </Typography.Text>
          {running ? (
            <Button onClick={cancelResponse}>Cancel response</Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!canAsk || !question.trim()}
              onClick={() => void send()}
            >
              Send question
            </Button>
          )}
        </div>
        <details className="ai-disclosure ai-footnote">
          <summary>AI can be wrong. Check cited passages.</summary>
          <p>
            Cancellation may not avoid provider charges already incurred. Retrieved passages do not
            provide a comprehensive whole-book summary.
          </p>
        </details>
      </div>
    </section>
  );
}
