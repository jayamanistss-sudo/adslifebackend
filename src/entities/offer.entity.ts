import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('offers')
export class Offer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'general' })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  image_url: string | null;

  @Column({ type: 'simple-json', nullable: true })
  images: string[] | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  coupon_code: string | null;

  @Column({ type: 'text', nullable: true })
  redeem_url: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, default: 0 })
  discount_percent: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  original_price: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  offer_price: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  max_redemptions: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  current_redemptions: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  views: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  clicks: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  saves: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  shares: number | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'timestamp', nullable: true })
  valid_from: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  valid_until: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
