import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Book } from '../../books/entities/book.entity';
export type Segment = {
  page: number;
  rectangles: { x: number; y: number; width: number; height: number }[];
};
@Entity('annotations')
@Unique('annotations_userId_bookId_clientRequestId_key', ['userId', 'bookId', 'clientRequestId'])
@Index('annotations_owner_page', ['userId', 'bookId', 'firstPage', 'id'], {
  where: 'deleted = false',
})
@Index('annotations_owner_updated', ['userId', 'bookId', 'updatedAt', 'id'], {
  where: 'deleted = false',
})
@Index('annotations_segments', { synchronize: false })
export class Annotation {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @Column('uuid') bookId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'annotations_userId_fkey' })
  user!: User;
  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'bookId',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'annotations_bookId_userId_fkey',
    },
    { name: 'userId', referencedColumnName: 'userId' },
  ])
  book!: Book;
  @Column('uuid') clientRequestId!: string;
  @Column('text') requestHash!: string;
  @Column('varchar') kind!: 'HIGHLIGHT' | 'NOTE';
  @Column({ type: 'text', nullable: true }) selectedText!: string | null;
  @Column({ type: 'text', nullable: true }) noteText!: string | null;
  @Column({ type: 'varchar', nullable: true }) color!: string | null;
  @Column({ type: 'uuid', nullable: true }) documentVersion!: string | null;
  @Column({ type: 'integer', nullable: true }) coordinateVersion!: number | null;
  @Column({ type: 'jsonb', nullable: true }) segments!: Segment[] | null;
  @Column({ type: 'integer', nullable: true }) firstPage!: number | null;
  @Column({ type: 'integer', default: 1 }) version!: number;
  @Column({ type: 'boolean', default: false }) deleted!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
