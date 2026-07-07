import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { NotificationTemplateService } from './notification-template.service';
import { isPrimaryInstance } from '../common/utils/cron-guard';

/**
 * Reminds users when an offer they SAVED is expiring within 24 hours.
 * Highest-converting push a deals app can send — the user already showed
 * intent by saving.
 */
@Injectable()
export class ExpiryReminderService {
  private readonly logger = new Logger(ExpiryReminderService.name);

  constructor(
    private readonly pushService: PushService,
    private readonly templateService: NotificationTemplateService,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  // 18:30 IST daily — evening, before people plan their next day
  @Cron('30 18 * * *', { name: 'expiry_reminder', timeZone: 'Asia/Kolkata' })
  async sendExpiryReminders() {
    if (!isPrimaryInstance()) return;
    // Saved offers whose offer expires in the next 24h, still active,
    // and not already reminded in the last 2 days.
    const rows: Array<{ user_id: number; offer_id: number; title: string }> =
      await this.notifRepo.manager.query(`
        SELECT so.user_id, o.id AS offer_id, o.title
        FROM saved_offers so
        JOIN offers o ON o.id = so.offer_id
        WHERE o.is_active = true
          AND o.valid_until IS NOT NULL
          AND o.valid_until BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.user_id = so.user_id
              AND n.offer_id = o.id
              AND n.type = 'expiry_reminder'
              AND n.created_at >= NOW() - INTERVAL '2 days'
          )
      `);

    if (!rows.length) {
      this.logger.log('Expiry reminders: nothing expiring within 24h');
      return;
    }

    let sent = 0;
    for (const row of rows) {
      const tpl = await this.templateService.pickRandom('expiry_reminder');
      if (!tpl) {
        this.logger.warn('Expiry reminders: no templates of type "expiry_reminder"');
        return;
      }
      const title = tpl.title.replaceAll('{{title}}', row.title);
      const body = tpl.body.replaceAll('{{title}}', row.title);
      sent += await this.pushService.send(row.user_id, title, body, {
        route: tpl.route,
        type: 'expiry_reminder',
        offer_id: String(row.offer_id),
      });
    }
    this.logger.log(`Expiry reminders → sent ${sent}/${rows.length}`);
  }
}
