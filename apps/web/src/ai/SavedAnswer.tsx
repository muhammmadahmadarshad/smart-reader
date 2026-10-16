import { memo } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import ReactMarkdown from 'react-markdown';
import type { AssistantMessage } from './assistant-types';
import type { SourceReference } from './types';
const SavedAnswer = memo(function SavedAnswer({
  item,
  onSource,
}: {
  item: AssistantMessage;
  onSource: (source: SourceReference) => void;
}) {
  return (
    <article className="ai-answer">
      <div className="ai-user-question">{item.question}</div>
      {item.selection && (
        <details className="ai-disclosure">
          <summary>Original browser selection</summary>
          <blockquote>{item.selection.selectedText}</blockquote>
        </details>
      )}
      <div className="ai-answer-label">
        <span>AI-generated</span>
        {item.status !== 'COMPLETED' && <Tag>{item.status}</Tag>}
      </div>
      <ReactMarkdown
        skipHtml
        components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}
      >
        {item.answer}
      </ReactMarkdown>
      <Space wrap>
        {item.citations.map((c) => (
          <Button
            key={c.id}
            size="small"
            title={c.excerpt}
            disabled={!c.source.pages}
            onClick={() => onSource(c.source)}
          >
            {c.id} · Page {c.source.pages?.first}
          </Button>
        ))}
      </Space>
      <div className="ai-answer-meta">
        {item.provider} · {item.model} · {new Date(item.createdAt).toLocaleString()}
      </div>
      {item.error && <Alert type="warning" message={item.error} />}
    </article>
  );
});

export default SavedAnswer;
