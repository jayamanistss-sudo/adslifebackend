import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';

@Injectable()
export class PromoNotificationService {
  private readonly logger = new Logger(PromoNotificationService.name);

  constructor(
    private readonly pushService: PushService,
    private readonly templateService: NotificationTemplateService,
    private readonly capService: NotificationCapService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserFcmToken) private readonly tokenRepo: Repository<UserFcmToken>,
  ) {}

  // ── Helpers ────────────────────────────────────────────────

  private async getActiveUserIds(): Promise<number[]> {
    const tokens = await this.tokenRepo.find({ select: ['user_id'] });
    return [...new Set(tokens.map((t) => t.user_id))];
  }

  private async broadcast(type: string, label: string) {
    const allIds = await this.getActiveUserIds();
    if (!allIds.length) {
      this.logger.log(`${label}: no FCM tokens found`);
      return;
    }

    const userIds = await this.capService.filterSendable(allIds, 'common');
    if (!userIds.length) {
      this.logger.log(`${label}: ${allIds.length} candidates, all capped out for today`);
      return;
    }

    const tpl = await this.templateService.pickRandom(type);
    if (!tpl) {
      this.logger.warn(`${label}: no templates found for type "${type}"`);
      return;
    }

    const sent = await this.pushService.send(userIds, tpl.title, tpl.body, {
      route: tpl.route,
      type,
    });
    this.logger.log(`${label} → sent ${sent}/${userIds.length} (${allIds.length} candidates) — "${tpl.title}"`);
  }

  // ── Cron Jobs ─────────────────────────────────────────────
  // The `cron` package interprets the pattern's fields directly in `timeZone`
  // when one is given — NOT in UTC. So these are plain IST clock times.

  // 7:00 AM IST
  @Cron('0 7 * * *', { name: 'morning_notif', timeZone: 'Asia/Kolkata' })
  async sendMorningNotification() {
    await this.broadcast('morning', 'Morning');
  }

  // 12:30 PM IST
  @Cron('30 12 * * *', { name: 'lunch_notif', timeZone: 'Asia/Kolkata' })
  async sendLunchNotification() {
    await this.broadcast('lunch', 'Lunch');
  }

  // 6:00 PM IST
  @Cron('0 18 * * *', { name: 'evening_notif', timeZone: 'Asia/Kolkata' })
  async sendEveningNotification() {
    await this.broadcast('evening', 'Evening');
  }

  // 9:00 PM IST
  @Cron('0 21 * * *', { name: 'dinner_notif', timeZone: 'Asia/Kolkata' })
  async sendDinnerNotification() {
    await this.broadcast('dinner', 'Dinner');
  }

  // 11:00 PM IST, every day
  @Cron('0 23 * * *', { name: 'goodnight_notif', timeZone: 'Asia/Kolkata' })
  async sendGoodNightNotification() {
    await this.broadcast('goodnight', 'Good Night');
  }

  // Saturday & Sunday 10:00 AM IST
  @Cron('0 10 * * 6,0', { name: 'weekend_notif', timeZone: 'Asia/Kolkata' })
  async sendWeekendNotification() {
    await this.broadcast('weekend', 'Weekend');
  }

  // Re-engagement: every Tuesday 11:00 AM IST — target users not seen in 3+ days
  @Cron('0 11 * * 2', { name: 'reengage_notif', timeZone: 'Asia/Kolkata' })
  async sendReengagementNotification() {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const allIds = await this.getActiveUserIds();

    const inactiveUsers = await this.userRepo
      .createQueryBuilder('u')
      .select('u.id')
      .where('u.id IN (:...ids)', { ids: allIds.length ? allIds : [0] })
      .andWhere('(u.last_login IS NULL OR u.last_login < :date)', { date: threeDaysAgo })
      .getMany();

    if (!inactiveUsers.length) return;
    const inactiveIds = await this.capService.filterSendable(inactiveUsers.map((u) => u.id), 'common');
    if (!inactiveIds.length) return;

    const tpl = await this.templateService.pickRandom('reengage');
    if (!tpl) {
      this.logger.warn('Re-engagement: no templates found for type "reengage"');
      return;
    }

    const sent = await this.pushService.send(inactiveIds, tpl.title, tpl.body, {
      route: tpl.route,
      type: 'reengage',
    });
    this.logger.log(`Re-engagement → sent ${sent}/${inactiveIds.length}`);
  }
}
