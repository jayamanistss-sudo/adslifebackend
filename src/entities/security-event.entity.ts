import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('security_events')
export class SecurityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'varchar', length: 20 })
  severity: string;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 45 })
  ip_address: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  endpoint: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata: any | null;

  @Column({ type: 'boolean', default: false })
  is_resolved: boolean;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'int', nullable: true })
  resolved_by: number | null;

  @CreateDateColumn()
  created_at: Date;
}
