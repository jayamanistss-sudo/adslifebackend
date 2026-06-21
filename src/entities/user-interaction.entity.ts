import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum InteractionAction {
  VIEW = 'view',
  CLICK = 'click',
  SAVE = 'save',
  REDEEM = 'redeem',
  SHARE = 'share',
  SKIP = 'skip',
  SEARCH = 'search',
}

@Entity('user_interactions')
export class UserInteraction {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int', nullable: true })
  offer_id: number | null;

  @Column({ type: 'enum', enum: InteractionAction })
  action: InteractionAction;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  search_term: string | null;

  @CreateDateColumn()
  created_at: Date;
}
