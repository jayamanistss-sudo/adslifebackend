import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum GroupDealStatus {
  ACTIVE = 'active',
  FULFILLED = 'fulfilled',
  EXPIRED = 'expired',
}

@Entity('group_deals')
export class GroupDeal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @Column({ type: 'int', default: 5 })
  min_members: number;

  @Column({ type: 'int', nullable: true })
  max_members: number | null;

  @Column({ type: 'enum', enum: GroupDealStatus, nullable: true, default: GroupDealStatus.ACTIVE })
  status: GroupDealStatus | null;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
