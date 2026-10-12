import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Input, List, Progress, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useDocumentSearch } from './useDocumentSearch';
export default function SearchPanel({
  pdf,
  onPage,
}: {
  pdf: PDFDocumentProxy | null;
  onPage: (page: number) => void;
}) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(-1);
  const search = useDocumentSearch(pdf);
  useEffect(() => {
    setActive(-1);
  }, [term]);
  function select(index: number) {
    if (!search.matches.length) return;
    const next = (index + search.matches.length) % search.matches.length;
    setActive(next);
    onPage(search.matches[next].page);
  }
  return (
    <div>
      <Input.Search
        aria-label="Search this PDF"
        placeholder="Find a word or phrase"
        value={term}
        maxLength={200}
        onChange={(e) => {
          search.cancel();
          setTerm(e.target.value);
        }}
        onSearch={() => {
          setActive(-1);
          void search.search(term);
        }}
        enterButton="Find"
        disabled={!pdf}
      />
      {search.running && (
        <div className="search-progress" role="status">
          <Progress
            percent={Math.round((search.scanned / (pdf?.numPages || 1)) * 100)}
            size="small"
          />
          <Space>
            <Typography.Text type="secondary">
              Searching page {search.scanned} of {pdf?.numPages}
            </Typography.Text>
            <Button size="small" onClick={search.cancel}>
              Cancel search
            </Button>
          </Space>
        </div>
      )}
      {search.note && <Alert className="form-alert" type="info" message={search.note} />}
      {!!search.matches.length && (
        <>
          <div className="match-controls">
            <Typography.Text>
              {search.matches.length} matches{active >= 0 ? ` · ${active + 1} selected` : ''}
            </Typography.Text>
            <Space size={4}>
              <Button
                aria-label="Previous match"
                icon={<LeftOutlined />}
                onClick={() => select(active < 0 ? search.matches.length - 1 : active - 1)}
              />
              <Button
                aria-label="Next match"
                icon={<RightOutlined />}
                onClick={() => select(active + 1)}
              />
            </Space>
          </div>
          <List
            dataSource={search.matches}
            pagination={
              search.matches.length > 20
                ? { pageSize: 20, size: 'small', showSizeChanger: false }
                : false
            }
            renderItem={(match) => (
              <List.Item>
                <Button
                  className={`search-match ${search.matches[active] === match ? 'selected' : ''}`}
                  type="text"
                  onClick={() => select(search.matches.indexOf(match))}
                >
                  <strong>Page {match.page}</strong>
                  <span>{match.snippet}</span>
                </Button>
              </List.Item>
            )}
          />
        </>
      )}
      {!search.running && !search.note && !search.matches.length && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Search the text inside this book."
        />
      )}
    </div>
  );
}
