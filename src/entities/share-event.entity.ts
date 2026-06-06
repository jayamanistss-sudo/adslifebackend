import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('share_events')
export class ShareEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @Column({ type: 'varchar', length: 50, default: 'general' })
  platform: string;

  @CreateDateColumn()
  created_at: Date;
}
