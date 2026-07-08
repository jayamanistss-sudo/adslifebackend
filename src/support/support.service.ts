import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from '../entities/support-ticket.entity';
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

  async create(userId: number, subject: string, message: string, category = 'general') {
    const ticket = await this.ticketRepo.save({
      user_id: userId,
      subject,
      message,
      category,
      status: TicketStatus.OPEN,
    });
    return { id: ticket.id, status: 'open' };
  }

  async list(userId: number, role: string, status = '') {
    if (role === 'admin') {
      const qb = this.ticketRepo
        .createQueryBuilder('st')
        .innerJoin(User, 'u', 'u.id = st.user_id')
        .select(['st.*', 'u.name AS user_name', 'u.email AS email'])
        .orderBy('st.created_at', 'DESC');
      if (status) qb.where('st.status = :status', { status });
      return qb.getRawMany();
    }
    const where: any = { user_id: userId };
    if (status) where.status = status;
    return this.ticketRepo.find({ where, order: { created_at: 'DESC' } });
  }

  async reply(ticketId: number, userId: number, message: string, role: string) {
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
      await this.ticketRepo.update(ticketId, { status: TicketStatus.ANSWERED });

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
