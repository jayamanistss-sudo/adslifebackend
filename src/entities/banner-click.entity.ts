import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// No banner ad click tracking existed at all — a vendor had no way to know
// whether their (paid) banner was actually driving click-throughs.
@Entity('banner_clicks')
@Index(['banner_id'])
export class BannerClick {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  banner_id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
