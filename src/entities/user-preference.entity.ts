import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_preferences')
export class UserPreference {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  user_id: number;

  @Column({ type: 'json', nullable: true })
  preferred_categories: any | null;

  @Column({ type: 'json', nullable: true })
  preferred_vendors: any | null;

  @Column({ type: 'int', nullable: true, default: 15 })
  max_distance_km: number | null;

  @UpdateDateColumn()
  updated_at: Date;
}
