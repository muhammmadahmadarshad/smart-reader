import { Alert, Button, Progress } from 'antd';
import type { BookAssistant } from './useBookAssistant';

export default function BookPreparation({ assistant }: { assistant: BookAssistant }) {
  const { index, prepare, cancelPreparation } = assistant;
  const bookIndex = index.data;
  if (index.isPending) return <p className="ai-provider-disclosure">Checking book availability…</p>;
  if (index.isError)
    return (
      <Alert
        type="warning"
        message="Book status unavailable"
        action={
          <Button size="small" onClick={() => void index.refetch()}>
            Retry
          </Button>
        }
      />
    );
  if (!bookIndex) return null;

  const preparing = ['QUEUED', 'PROCESSING'].includes(bookIndex.status);
  const extractionProgress = bookIndex.pagesProcessed / (bookIndex.totalPages || 1);
  const embeddingProgress = bookIndex.chunksEmbedded / (bookIndex.totalChunks || 1);
  const percentage = Math.floor((extractionProgress + embeddingProgress) * 50);
  const hasCoverage = Boolean(
    bookIndex.coverage.textPages || bookIndex.coverage.limitations?.length,
  );

  return (
    <div className="ai-book-preparation">
      {preparing ? (
        <>
          <div className="ai-index-status">
            <span>Preparing your book</span>
            <Button size="small" type="text" onClick={() => void cancelPreparation()}>
              Cancel preparation
            </Button>
          </div>
          <Progress size="small" percent={percentage} />
          <p className="ai-provider-disclosure">
            {bookIndex.pagesProcessed}/{bookIndex.totalPages} pages · {bookIndex.chunksEmbedded}/
            {bookIndex.totalChunks} chunks
          </p>
        </>
      ) : bookIndex.ready ? (
        <div className="ai-index-status ai-ready">
          <span>
            <span className="ai-status-dot" />
            Book ready for questions
          </span>
        </div>
      ) : bookIndex.available ? (
        <Button block onClick={prepare}>
          Prepare book for AI
        </Button>
      ) : (
        <details className="ai-disclosure">
          <summary>Book questions unavailable</summary>
          <p>
            {bookIndex.reason || 'The embedding service is unavailable.'} You can still ask about
            selected text with a validated connection.
          </p>
        </details>
      )}
      {bookIndex.failure && (
        <Alert
          type="warning"
          message="Book preparation did not finish"
          description={bookIndex.failure}
        />
      )}
      {hasCoverage && (
        <details className="ai-disclosure">
          <summary>Text coverage and limitations</summary>
          {bookIndex.coverage.limitations?.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
          {bookIndex.coverage.textPages && (
            <p>
              Text on {bookIndex.coverage.textPages.length} pages; no text on{' '}
              {bookIndex.coverage.emptyPages?.length || 0}; extraction failures on{' '}
              {bookIndex.coverage.failedPages?.length || 0}.
            </p>
          )}
        </details>
      )}
    </div>
  );
}
