import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  order_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_session_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cashfree_payment_id: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentStatus, nullable: true, default: PaymentStatus.PENDING })
  status: PaymentStatus | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  purpose: string | null;

  @Column({ type: 'int', nullable: true })
  reference_id: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  reference_type: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
