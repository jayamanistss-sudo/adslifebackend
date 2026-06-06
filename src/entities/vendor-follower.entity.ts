import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('vendor_followers')
export class VendorFollower {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  vendor_id: number;

  @CreateDateColumn()
  created_at: Date;
}
