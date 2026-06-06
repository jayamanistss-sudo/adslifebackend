import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

export enum FraudEntityType {
  VENDOR = 'vendor',
  OFFER = 'offer',
}

export enum FraudFlagStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
}

@Entity('fraud_flags')
@Unique(['entity_type', 'entity_id'])
export class FraudFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: FraudEntityType })
  entity_type: FraudEntityType;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ type: 'text', nullable: true })
  flag_reason: string | null;

  @Column({ type: 'int', nullable: true, default: 0 })
  confidence_score: number | null;

  @Column({ type: 'enum', enum: FraudFlagStatus, nullable: true, default: FraudFlagStatus.PENDING })
  status: FraudFlagStatus | null;

  @Column({ type: 'text', nullable: true })
  review_note: string | null;

  @CreateDateColumn()
  created_at: Date;
}
