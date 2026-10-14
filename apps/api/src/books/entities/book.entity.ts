import {
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
import { BookStatus } from '../types/book-status';
@Entity('books')
@Index(['id', 'userId'], { unique: true })
@Index(['userId', 'createdAt'])
@Index(['userId', 'lastOpenedAt'])
@Index(['userId', 'title'])
export class Book {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user!: User;
  @Column({ length: 200 }) title!: string;
  @Column({ unique: true, select: false }) objectKey!: string;
  @Column('integer') size!: number;
  @Column({ type: 'integer', nullable: true }) pageCount!: number | null;
  @Column({ type: 'jsonb', nullable: true }) pageBoxes!: number[][] | null;
  @Column({ type: 'varchar', default: 'UPLOADING', length: 16 }) status!: BookStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) lastOpenedAt!: Date | null;
}
