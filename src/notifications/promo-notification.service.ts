import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';
import { isPrimaryInstance } from '../common/utils/cron-guard';
import { PromoScheduleConfigService, PromoSchedule } from './promo-schedule-config.service';

// Send times were static @Cron decorators — no admin lever to retune
// without a code deploy, and no way to change them without a restart.
// Registered dynamically via SchedulerRegistry instead, sourced from
// PromoScheduleConfigService, so an admin edit takes effect immediately.
const JOB_NAMES: Record<keyof PromoSchedule, string> = {
  morning: 'morning_notif',
  lunch: 'lunch_notif',
  evening: 'evening_notif',
  dinner: 'dinner_notif',
  goodnight: 'goodnight_notif',
  weekend: 'weekend_notif',
  reengage: 'reengage_notif',
};

@Injectable()
export class PromoNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PromoNotificationService.name);

  constructor(
    private readonly pushService: PushService,
    private readonly templateService: NotificationTemplateService,
    private readonly capService: NotificationCapService,
    private readonly scheduleConfig: PromoScheduleConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserFcmToken) private readonly tokenRepo: Repository<UserFcmToken>,
  ) {}

  async onModuleInit() {
    await this.reloadSchedule();
  }

  private handlerFor(key: keyof PromoSchedule): () => Promise<void> {
    const handlers: Record<keyof PromoSchedule, () => Promise<void>> = {
      morning: () => this.sendMorningNotification(),
      lunch: () => this.sendLunchNotification(),
      evening: () => this.sendEveningNotification(),
      dinner: () => this.sendDinnerNotification(),
      goodnight: () => this.sendGoodNightNotification(),
      weekend: () => this.sendWeekendNotification(),
      reengage: () => this.sendReengagementNotification(),
    };
    return handlers[key];
  }

  /** Re-registers one job with a fresh cron time. */
  private registerJob(key: keyof PromoSchedule, cronTime: string) {
    const name = JOB_NAMES[key];
    const handler = this.handlerFor(key);
    if (this.schedulerRegistry.doesExist('cron', name)) {
      this.schedulerRegistry.deleteCronJob(name);
    }
    const job = new CronJob(cronTime, () => { handler().catch((e) => this.logger.error(`${name} failed`, e)); }, null, true, 'Asia/Kolkata');
    this.schedulerRegistry.addCronJob(name, job as any);
  }

  /** Re-reads config and re-registers all jobs — called at boot and after an admin schedule update. */
  async reloadSchedule() {
    const schedule = await this.scheduleConfig.getSchedule();
    for (const key of Object.keys(JOB_NAMES) as (keyof PromoSchedule)[]) {
      this.registerJob(key, schedule[key]);
    }
  }

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
  // Registered dynamically in reloadSchedule() (see onModuleInit above),
  // not via @Cron decorators — schedule times are admin-tunable through
  // PromoScheduleConfigService and take effect without a restart.
  // The `cron` package interprets the pattern's fields directly in the IST
  // timeZone passed to registerJob() — NOT in UTC.

  async sendMorningNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('morning', 'Morning');
  }

  async sendLunchNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('lunch', 'Lunch');
  }

  async sendEveningNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('evening', 'Evening');
  }

  async sendDinnerNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('dinner', 'Dinner');
  }

  async sendGoodNightNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('goodnight', 'Good Night');
  }

  async sendWeekendNotification() {
    if (!isPrimaryInstance()) return;
    await this.broadcast('weekend', 'Weekend');
  }

  // Re-engagement: target users not seen in 3+ days
  async sendReengagementNotification() {
    if (!isPrimaryInstance()) return;
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
