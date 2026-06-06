import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AbTestStatus {
  RUNNING = 'running',
  CONCLUDED = 'concluded',
  CANCELLED = 'cancelled',
}

@Entity('ab_tests')
export class AbTest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int' })
  offer_id_a: number;

  @Column({ type: 'int' })
  offer_id_b: number;

  @Column({ type: 'int', nullable: true })
  winner_offer_id: number | null;

  @Column({ type: 'enum', enum: AbTestStatus, nullable: true, default: AbTestStatus.RUNNING })
  status: AbTestStatus | null;

  @Column({ type: 'timestamp', nullable: true })
  ends_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  concluded_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
