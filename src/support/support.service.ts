import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SupportService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(userId: number, subject: string, message: string, category = 'general') {
    const result = await this.db.query(
      'INSERT INTO support_tickets (user_id, subject, message, category, status) VALUES ($1, $2, $3, $4, \'open\') RETURNING id',
      [userId, subject, message, category],
    );
    return { id: result[0].id, status: 'open' };
  }

  async list(userId: number, role: string, status = '') {
    if (role === 'admin') {
      const where = status ? 'WHERE st.status = $1' : '';
      return this.db.query(
        `SELECT st.*, u.name as user_name, u.email
         FROM support_tickets st JOIN users u ON st.user_id = u.id
         ${where} ORDER BY st.created_at DESC`,
        status ? [status] : [],
      );
    }
    const where = status ? 'AND status = $2' : '';
    return this.db.query(
      `SELECT * FROM support_tickets WHERE user_id = $1 ${where} ORDER BY created_at DESC`,
      status ? [userId, status] : [userId],
    );
  }

  async reply(ticketId: number, userId: number, message: string, role: string) {
    const [ticket] = await this.db.query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (role !== 'admin' && ticket.user_id !== userId) throw new ForbiddenException('Access denied');

    await this.db.query(
      'INSERT INTO support_replies (ticket_id, user_id, message, is_staff) VALUES ($1, $2, $3, $4)',
      [ticketId, userId, message, role === 'admin' ? 1 : 0],
    );

    if (role === 'admin') {
      await this.db.query(
        'UPDATE support_tickets SET status = \'answered\' WHERE id = $1',
        [ticketId],
      );
    }
    return { replied: true };
  }
}
