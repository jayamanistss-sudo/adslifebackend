import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  request_id: string | null;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 20 })
  role: string;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  entity_type: string | null;

  @Column({ type: 'int', nullable: true })
  entity_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: any | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @CreateDateColumn()
  created_at: Date;
}
