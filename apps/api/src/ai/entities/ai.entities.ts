import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Book } from '../../books/entities/book.entity';
import type { SourceReference, ProviderUsage } from '../contracts';
export type ConnectionProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'compatible';
abstract class Owned {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user!: User;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
abstract class OwnedBook extends Owned {
  @Column('uuid') bookId!: string;
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'bookId', referencedColumnName: 'id' },
    { name: 'userId', referencedColumnName: 'userId' },
  ])
  book!: Book;
}
@Entity('ai_connections')
export class AiConnection extends Owned {
  @Column('text') name!: string;
  @Column('text') provider!: ConnectionProvider;
  @Column('text') baseUrl!: string;
  @Column('text') model!: string;
  @Column({ type: 'text', nullable: true, select: false }) encryptedKey!: string | null;
  @Column({ type: 'text', nullable: true }) keySuffix!: string | null;
  @Column({ type: 'text', default: 'UNVALIDATED' }) validation!: string;
  @Column({ type: 'timestamptz', nullable: true }) validatedAt!: Date | null;
  @Column({ type: 'jsonb', default: [] }) validatedModels!: string[];
  @Column({ type: 'boolean', default: true }) streaming!: boolean;
  @Column({ type: 'integer', default: 1 }) revision!: number;
}
@Entity('ai_preferences')
export class AiPreference extends Owned {
  @Column({ type: 'uuid', nullable: true }) connectionId!: string | null;
  @Column({ type: 'text', nullable: true }) model!: string | null;
}
export type IndexStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED';
@Entity('ai_indexes')
export class AiIndex extends OwnedBook {
  @Column('uuid') documentVersion!: string;
  @Column('text') configKey!: string;
  @Column('jsonb') configuration!: Record<string, unknown>;
  @Column('integer') dimensions!: number;
  @Column({ type: 'boolean', default: false }) active!: boolean;
  @Column({ type: 'text', default: 'QUEUED' }) status!: IndexStatus;
}
@Entity('ai_runs')
export class AiRun extends OwnedBook {
  @Column('uuid') indexId!: string;
  @Column({ type: 'text', default: 'QUEUED' }) status!: IndexStatus;
  @Column({ type: 'integer', default: 0 }) pagesProcessed!: number;
  @Column({ type: 'integer', default: 0 }) chunksEmbedded!: number;
  @Column({ type: 'integer', default: 0 }) totalChunks!: number;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ type: 'text', nullable: true }) failure!: string | null;
  @Column({ type: 'jsonb', default: {} }) coverage!: {
    textPages?: number[];
    emptyPages?: number[];
    failedPages?: number[];
    limitations?: string[];
  };
  @Column({ type: 'uuid', nullable: true }) leaseToken!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) leaseUntil!: Date | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) availableAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
@Entity('ai_pages')
export class AiPage extends OwnedBook {
  @Column('uuid') indexId!: string;
  @Column('integer') page!: number;
  @Column('text') text!: string;
  @Column('boolean') failed!: boolean;
}
@Entity('ai_chunks')
export class AiChunk extends OwnedBook {
  @Column('uuid') indexId!: string;
  @Column('uuid') documentVersion!: string;
  @Column('text') stableId!: string;
  @Column('text') text!: string;
  @Column('jsonb') spans!: { page: number; start: number; end: number }[];
  @Column('integer') tokens!: number;
  @Column({ type: 'vector', nullable: true, select: false }) embedding!: number[] | null;
}
@Entity('ai_conversations')
export class AiConversation extends OwnedBook {
  @Column('text') title!: string;
}
@Entity('ai_messages')
export class AiMessage extends OwnedBook {
  @Column('uuid') conversationId!: string;
  @Column('uuid') requestId!: string;
  @Column('text') requestHash!: string;
  @Column('text') question!: string;
  @Column({ type: 'text', default: '' }) answer!: string;
  @Column({ type: 'text', default: 'PENDING' }) status!:
    'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INCOMPLETE';
  @Column({ type: 'uuid', nullable: true }) connectionId!: string | null;
  @Column('text') provider!: string;
  @Column('text') model!: string;
  @Column('text') action!: string;
  @Column({ type: 'jsonb', nullable: true }) selection!: unknown;
  @Column({ type: 'jsonb', default: [] }) citations!: {
    id: string;
    source: SourceReference;
    excerpt: string;
  }[];
  @Column({ type: 'jsonb', nullable: true }) usage!: ProviderUsage | null;
  @Column({ type: 'text', nullable: true }) error!: string | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
@Entity('ai_usage')
export class AiUsage extends Owned {
  @Column('uuid') requestId!: string;
  @Column('text') kind!: 'INDEX_PAGES' | 'DOCUMENT_EMBEDDING' | 'QUERY_EMBEDDING' | 'USER_LLM';
  @Column('text') status!: 'RESERVED' | 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  @Column('integer') units!: number;
  @Column({ type: 'jsonb', nullable: true }) reported!: ProviderUsage | null;
  @Column({ type: 'text', nullable: true }) provider!: string | null;
  @Column({ type: 'text', nullable: true }) model!: string | null;
  @Column({ type: 'integer', nullable: true }) durationMs!: number | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
export const aiEntities = [
  AiConnection,
  AiPreference,
  AiIndex,
  AiRun,
  AiPage,
  AiChunk,
  AiConversation,
  AiMessage,
  AiUsage,
];
