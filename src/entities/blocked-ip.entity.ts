import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('blocked_ips')
export class BlockedIp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 45, unique: true })
  ip_address: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'int', nullable: true })
  blocked_by: number | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
