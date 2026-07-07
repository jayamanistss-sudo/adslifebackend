import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('redemption_codes')
export class RedemptionCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 8, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: string; // 'pending' | 'verified'

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  verified_at: Date | null;

  @Column({ type: 'int', nullable: true })
  verified_by: number | null;
}
