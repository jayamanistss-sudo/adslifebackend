import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('api_logs')
export class ApiLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  request_id: string | null;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  role: string | null;

  @Column({ type: 'varchar', length: 45 })
  ip_address: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 500 })
  endpoint: string;

  @Column({ type: 'int' })
  status_code: number;

  @Column({ type: 'text', nullable: true })
  request_body: string | null;

  @Column({ type: 'text', nullable: true })
  response_body: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent: string | null;

  @Column({ type: 'json', nullable: true })
  device_info: any | null;

  @Column({ type: 'int', nullable: true })
  response_time_ms: number | null;

  @Column({ type: 'boolean', default: false })
  is_suspicious: boolean;

  @CreateDateColumn()
  created_at: Date;
}
