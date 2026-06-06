import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('banner_ad_requests')
export class BannerAdRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'text' })
  image_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  target_url: string | null;

  @Column({ type: 'varchar', length: 50, default: 'top' })
  position: string;

  @Column({ type: 'int', default: 7 })
  duration_days: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
