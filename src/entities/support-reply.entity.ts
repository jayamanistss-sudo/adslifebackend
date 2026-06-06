import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('support_replies')
export class SupportReply {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  ticket_id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_staff: boolean | null;

  @CreateDateColumn()
  created_at: Date;
}
