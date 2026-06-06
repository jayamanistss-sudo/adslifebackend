import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum TicketStatus {
  OPEN = 'open',
  ANSWERED = 'answered',
  CLOSED = 'closed',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'general' })
  category: string | null;

  @Column({ type: 'enum', enum: TicketStatus, nullable: true, default: TicketStatus.OPEN })
  status: TicketStatus | null;

  @CreateDateColumn()
  created_at: Date;
}
