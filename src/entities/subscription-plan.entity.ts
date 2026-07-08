import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'int', default: 30 })
  duration_days: number;

  @Column({ type: 'int', nullable: true })
  max_offers: number | null;

  @Column({ type: 'json', nullable: true })
  features: any | null;

  // Marketing copy in `features` is free text and never checked by code.
  // This is the actual enforcement source — canonical keys from
  // PLAN_FEATURE_KEYS in plan-features.service.ts.
  @Column({ type: 'json', default: () => "'[]'" })
  feature_flags: string[];

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
