import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'push' })
  type: string | null;

  @Column({ type: 'int', nullable: true })
  offer_id: number | null;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_read: boolean | null;

  @CreateDateColumn()
  created_at: Date;
}
