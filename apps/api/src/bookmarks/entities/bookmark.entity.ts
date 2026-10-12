import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Book } from '../../books/entities/book.entity';
@Entity('bookmarks')
@Index(['userId', 'bookId', 'page'], { unique: true })
@Check('"page" >= 1')
export class Bookmark {
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
  @Column({ length: 120 }) label!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
