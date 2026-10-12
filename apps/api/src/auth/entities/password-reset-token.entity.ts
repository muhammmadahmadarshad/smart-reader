import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true, length: 64 }) tokenHash!: string;
  @Index() @Column('uuid') userId!: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'userId' }) user!: User;
  @Index() @Column('timestamptz') expiresAt!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
