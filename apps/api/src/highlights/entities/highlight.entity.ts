import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Book } from '../../books/entities/book.entity';
import type { HighlightRectangle } from '../types/highlight.types';
@Entity('highlights')
@Index(['userId', 'bookId', 'page'])
@Check('"page" >= 1')
export class Highlight {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') bookId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user!: User;
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'bookId', referencedColumnName: 'id' },
    { name: 'userId', referencedColumnName: 'userId' },
  ])
  book!: Book;
  @Column('integer') page!: number;
  @Column({ type: 'text' }) text!: string;
  @Column('jsonb') rectangles!: HighlightRectangle[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
