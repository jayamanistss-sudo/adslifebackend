import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('user_locations')
@Index(['user_id', 'created_at'])
export class UserLocation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 8 })
  lat: number;

  @Column({ type: 'decimal', precision: 11, scale: 8 })
  lng: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'float', nullable: true })
  accuracy: number | null;

  @Column({ type: 'varchar', length: 20, default: 'gps', nullable: true })
  source: string | null;

  @CreateDateColumn()
  created_at: Date;
}
