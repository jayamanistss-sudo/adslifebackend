import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from 'typeorm';

@Entity('vendor_daily_stats')
@Unique(['vendor_id', 'stat_date'])
export class VendorDailyStat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'date' })
  stat_date: Date;

  @Column({ type: 'int', nullable: true, default: 0 })
  impressions: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  clicks: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  saves: number | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  redemptions: number | null;
}
