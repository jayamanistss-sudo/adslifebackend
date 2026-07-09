import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus, TicketPriority } from '../entities/support-ticket.entity';
import { SupportReply } from '../entities/support-reply.entity';
import { User } from '../entities/user.entity';
import { PushService } from '../services/push.service';
import { MailService } from '../mail/mail.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket) private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(SupportReply) private readonly replyRepo: Repository<SupportReply>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly notificationSettings: NotificationSettingsService,
  ) {}

  async create(userId: number, subject: string, message: string, category = 'general', priority?: string) {
    const ticket = await this.ticketRepo.save({
      user_id: userId,
      subject,
      message,
      category,
      priority: (priority as any) ?? TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
    });
    return { id: ticket.id, status: 'open' };
  }

  async list(userId: number, role: string, status = '') {
    if (role === 'admin') {
      const qb = this.ticketRepo
        .createQueryBuilder('st')
        .innerJoin(User, 'u', 'u.id = st.user_id')
        .select([
          'st.*', 'u.name AS user_name', 'u.email AS email',
          // Replies live in their own table (support_replies), not a single
          // column on the ticket — the admin UI previously read a
          // nonexistent `t.admin_reply` field and always rendered blank.
          `(SELECT sr.message FROM support_replies sr
              WHERE sr.ticket_id = st.id AND sr.is_staff = true
              ORDER BY sr.created_at DESC LIMIT 1) AS admin_reply`,
        ])
        .orderBy('st.created_at', 'DESC');
      if (status) qb.where('st.status = :status', { status });
      return qb.getRawMany();
    }
    // Same admin_reply gap applies to a vendor/user viewing their own
    // tickets — plain find() has no such column either.
    const qb = this.ticketRepo
      .createQueryBuilder('st')
      .select([
        'st.*',
        `(SELECT sr.message FROM support_replies sr
            WHERE sr.ticket_id = st.id AND sr.is_staff = true
            ORDER BY sr.created_at DESC LIMIT 1) AS admin_reply`,
        `(SELECT sr.created_at FROM support_replies sr
            WHERE sr.ticket_id = st.id AND sr.is_staff = true
            ORDER BY sr.created_at DESC LIMIT 1) AS replied_at`,
      ])
      .where('st.user_id = :userId', { userId })
      .orderBy('st.created_at', 'DESC');
    if (status) qb.andWhere('st.status = :status', { status });
    return qb.getRawMany();
  }

  async reply(ticketId: number, userId: number, message: string, role: string, status?: string, priority?: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (role !== 'admin' && ticket.user_id !== userId) throw new ForbiddenException('Access denied');

    await this.replyRepo.save({
      ticket_id: ticketId,
      user_id: userId,
      message,
      is_staff: role === 'admin',
    });

    if (role === 'admin') {
      // Honor the admin's chosen status/priority — previously hardcoded to
      // ANSWERED on every reply regardless of what was selected, which is
      // also why a ticket could never actually reach CLOSED.
      const update: Record<string, any> = { status: status ?? TicketStatus.ANSWERED };
      if (priority) update.priority = priority;
      await this.ticketRepo.update(ticketId, update);

      const user = await this.userRepo.findOne({ where: { id: ticket.user_id }, select: ['id', 'name', 'email'] });
      if (user) {
        await this.push.send(user.id, 'Support Replied', `We've replied to your ticket "${ticket.subject}".`, { type: 'support_reply', route: '/support' });
        if (user.email && await this.notificationSettings.isEnabled('support_reply', 'email')) {
          await this.mail.sendStatusEmail(
            user.email, user.name, `Reply to your ticket: ${ticket.subject}`,
            `Our support team replied to your ticket "<strong>${ticket.subject}</strong>": <br><br>${message}`,
            'View Ticket', `${process.env.APP_URL || 'https://adslife.in'}/support`,
          );
        }
      }
    }
    return { replied: true };
  }
}
