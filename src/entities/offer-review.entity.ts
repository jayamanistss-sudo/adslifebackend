import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('offer_reviews')
@Unique(['offer_id', 'user_id'])
export class OfferReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  offer_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'text', nullable: true })
  vendor_reply: string | null;

  @Column({ type: 'timestamp', nullable: true })
  replied_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
