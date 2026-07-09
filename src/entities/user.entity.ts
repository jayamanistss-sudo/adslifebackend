import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  VENDOR = 'vendor',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password_hash: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'varchar', length: 100, nullable: true })
  google_id: string | null;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lng: number | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'date', nullable: true })
  last_login: Date | null;

  @Column({ type: 'int', default: 0 })
  login_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'int', default: 0 })
  coins: number;

  @Column({ type: 'int', default: 0 })
  streak_count: number;

  @Column({ type: 'date', nullable: true })
  last_checkin: string | null;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  referral_code: string | null;

  @Column({ type: 'bigint', nullable: true })
  token_invalidated_at: number | null;

  @Column({ type: 'boolean', default: true })
  email_alerts: boolean;

  // Sub-tier within role='admin' only (support | moderator | super). Null for
  // non-admins. Checked live from the DB on every request (see jwt.strategy.ts)
  // rather than baked into the JWT, so a demotion takes effect immediately.
  @Column({ type: 'varchar', length: 30, nullable: true })
  admin_role: string | null;
}
