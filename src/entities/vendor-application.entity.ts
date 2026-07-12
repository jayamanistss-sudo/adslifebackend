import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vendor_applications')
export class VendorApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 200 })
  business_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gst_number: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lat: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  lng: number | null;

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;

  @Column({ type: 'int', nullable: true })
  plan_id: number | null;

  // Reliable link to the Payment row for this application's plan charge —
  // previously there was no column here at all, so admin.service.ts had to
  // fuzzy-match on user_id + reference_id=plan_id, which breaks down for
  // repeat applicants or concurrent payment attempts.
  @Column({ type: 'varchar', length: 100, nullable: true })
  order_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  admin_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
