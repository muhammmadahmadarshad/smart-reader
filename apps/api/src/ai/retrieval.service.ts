import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BooksService } from '../books/books.service';
import { AiIndex } from './entities/ai.entities';
import { AssistantConfig } from './assistant.config';
import type { SourceReference } from './contracts';
export type SourcedPassage = { id: string; text: string; score: number; source: SourceReference };
@Injectable()
export class RetrievalService {
  constructor(
    private readonly db: DataSource,
    private readonly books: BooksService,
    private readonly config: AssistantConfig,
  ) {}
  async ready(userId: string, bookId: string) {
    await this.books.owned(userId, bookId, true);
    if (!this.config.embeddingReady)
      throw new ServiceUnavailableException(
        'Project embedding service is unavailable. Use selection assistance or try later.',
      );
    const index = await this.db.getRepository(AiIndex).findOneBy({
      userId,
      bookId,
      documentVersion: bookId,
      configKey: this.config.embeddingKey,
      status: 'READY',
      active: true,
    });
    if (!index)
      throw new BadRequestException(
        'Prepare this book with the current project embedding configuration before asking book-wide questions.',
      );
    return index;
  }
  async search(
    userId: string,
    bookId: string,
    indexId: string,
    vector: number[],
  ): Promise<SourcedPassage[]> {
    if (!this.config.embeddingReady)
      throw new ServiceUnavailableException('Project embedding service is unavailable.');
    const book = await this.books.owned(userId, bookId, true);
    if (
      !userId ||
      !bookId ||
      vector.length !== this.config.embedding.dimensions ||
      vector.some((n) => !Number.isFinite(n)) ||
      !vector.some((n) => n !== 0)
    )
      throw new BadRequestException('Invalid authorized retrieval scope or embedding dimensions.');
    const rows = await this.db.query(
      `SELECT c.id,c.text,c.spans,1-(c.embedding <=> $1::vector) score FROM ai_chunks c JOIN ai_indexes i ON i.id=c."indexId" AND i."userId"=c."userId" AND i."bookId"=c."bookId" JOIN books b ON b.id=c."bookId" AND b."userId"=c."userId" WHERE c."userId"=$2 AND c."bookId"=$3 AND c."documentVersion"=$3 AND i."documentVersion"=$3 AND i.id=$4 AND i.active=true AND i.status='READY' AND i."configKey"=$5 AND i.dimensions=$6 AND b.status='READY' AND c.embedding IS NOT NULL ORDER BY c.embedding <=> $1::vector,c.id LIMIT 8`,
      [
        JSON.stringify(vector),
        userId,
        bookId,
        indexId,
        this.config.embeddingKey,
        this.config.embedding.dimensions,
      ],
    );
    return rows
      .filter((r: { score: number }) => Number(r.score) >= this.config.minScore)
      .map(
        (
          r: {
            id: string;
            text: string;
            score: number;
            spans: { page: number; start: number; end: number }[];
          },
          i: number,
        ) => ({
          id: `S${i + 1}`,
          text: r.text,
          score: Number(r.score),
          source: {
            sourceType: 'BOOK_TEXT' as const,
            bookId,
            documentVersion: bookId,
            sourceTitle: book.title,
            chunkId: r.id,
            pages: {
              first: Math.min(...r.spans.map((s) => s.page)),
              last: Math.max(...r.spans.map((s) => s.page)),
            },
          },
        }),
      );
  }
}
