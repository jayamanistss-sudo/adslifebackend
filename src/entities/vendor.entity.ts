import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VendorStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  // Set automatically when the fraud scorer's auto-reject threshold fires on
  // approval — previously that score just sat in fraud_flags unused and the
  // vendor went live regardless. All feed queries already gate on
  // status='approved', so this alone hides the vendor with no other changes.
  FRAUD_REVIEW = 'fraud_review',
}

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  user_id: number;

  @Column({ type: 'varchar', length: 200 })
  business_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lng: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gst_number: string | null;

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: VendorStatus, default: VendorStatus.PENDING_REVIEW })
  status: VendorStatus;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'free' })
  subscription_plan: string | null;

  @Column({ type: 'timestamp', nullable: true })
  plan_expires_at: Date | null;

  @Column({ type: 'int', default: 0 })
  total_followers: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
