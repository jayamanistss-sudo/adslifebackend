import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('spotlight_requests')
export class SpotlightRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'int', nullable: true })
  offer_id: number | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'int', default: 7 })
  duration_days: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  starts_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  ends_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
