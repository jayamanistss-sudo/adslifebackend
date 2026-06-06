import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('user_fcm_tokens')
export class UserFcmToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'web' })
  platform: string | null;

  @CreateDateColumn()
  created_at: Date;
}
