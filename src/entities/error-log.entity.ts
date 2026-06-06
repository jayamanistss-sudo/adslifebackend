import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('error_logs')
export class ErrorLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  request_id: string | null;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  endpoint: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ type: 'int', nullable: true })
  status_code: number | null;

  @Column({ type: 'varchar', length: 100 })
  error_type: string;

  @Column({ type: 'text' })
  error_message: string;

  @Column({ type: 'text', nullable: true })
  stack_trace: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: any | null;

  @CreateDateColumn()
  created_at: Date;
}
