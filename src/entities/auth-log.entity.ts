import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AuthAction {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  REGISTER = 'register',
  FORGOT_PASSWORD = 'forgot_password',
  RESET_PASSWORD = 'reset_password',
  TOKEN_INVALID = 'token_invalid',
  UNAUTHORIZED = 'unauthorized',
}

@Entity('auth_logs')
export class AuthLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  request_id: string | null;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  role: string | null;

  @Column({ type: 'enum', enum: AuthAction })
  action: AuthAction;

  @Column({ type: 'varchar', length: 45 })
  ip_address: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent: string | null;

  @Column({ type: 'json', nullable: true })
  device_info: any | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failure_reason: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: any | null;

  @CreateDateColumn()
  created_at: Date;
}
