import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  referrer_id: number;

  @Column({ type: 'int', unique: true })
  referred_id: number;

  @Column({ type: 'int', nullable: true, default: 50 })
  coins_awarded: number | null;

  @CreateDateColumn()
  created_at: Date;
}
