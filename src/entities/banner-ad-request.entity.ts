import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('banner_ad_requests')
export class BannerAdRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  image_url: string;

  @Column({ type: 'varchar', length: 10, default: 'image' })
  media_type: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  target_url: string | null;

  @Column({ type: 'varchar', length: 50, default: 'top' })
  position: string;

  @Column({ type: 'int', default: 7 })
  duration_days: number;

  @Column({ type: 'int', nullable: true })
  banner_plan_id: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  starts_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  order_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_session_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  paid_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
