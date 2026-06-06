import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('saved_offers')
export class SavedOffer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @CreateDateColumn()
  created_at: Date;
}
