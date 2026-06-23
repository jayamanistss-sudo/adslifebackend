import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NotificationOutboxStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  EXHAUSTED = 'exhausted',
}

@Entity('notification_outbox')
export class NotificationOutbox {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 50, default: 'push' })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, string> | null;

  @Column({ type: 'varchar', length: 20, default: NotificationOutboxStatus.PENDING })
  status: NotificationOutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', nullable: true })
  created_by: number | null;

  @Column({ type: 'int', nullable: true })
  updated_by: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
