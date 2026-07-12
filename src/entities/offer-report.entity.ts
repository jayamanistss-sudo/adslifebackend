import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export enum OfferReportReason {
  FAKE_OFFER = 'fake_offer',
  MISLEADING = 'misleading',
  EXPIRED = 'expired',
  SCAM = 'scam',
  OTHER = 'other',
}

@Entity('offer_reports')
@Unique(['offer_id', 'user_id'])
export class OfferReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 40 })
  reason: OfferReportReason;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
