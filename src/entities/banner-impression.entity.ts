import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// No banner ad view tracking existed at all — a vendor had no way to know
// how many people saw their (paid) banner.
@Entity('banner_impressions')
@Index(['banner_id'])
export class BannerImpression {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  banner_id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
