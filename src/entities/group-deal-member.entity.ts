import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('group_deal_members')
export class GroupDealMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  deal_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn()
  joined_at: Date;
}
