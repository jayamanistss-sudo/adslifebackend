import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { isPrimaryInstance } from '../common/utils/cron-guard';

/**
 * Weekly performance digest for vendors: "Your offers got X views,
 * Y saves this week". Keeps vendors engaged and renewing plans.
 */
@Injectable()
export class VendorDigestService {
  private readonly logger = new Logger(VendorDigestService.name);

  constructor(
    private readonly pushService: PushService,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  // Monday 10:00 IST
  @Cron('0 10 * * 1', { name: 'vendor_digest', timeZone: 'Asia/Kolkata' })
  async sendWeeklyDigest() {
    if (!isPrimaryInstance()) return;
    const rows: Array<{
      user_id: number;
      business_name: string;
      views: number;
      saves: number;
      clicks: number;
    }> = await this.notifRepo.manager.query(`
      SELECT v.user_id, v.business_name,
             COALESCE(SUM(CASE WHEN ui.action = 'view' THEN 1 ELSE 0 END), 0)::int AS views,
             COALESCE(SUM(CASE WHEN ui.action = 'save' THEN 1 ELSE 0 END), 0)::int AS saves,
             COALESCE(SUM(CASE WHEN ui.action IN ('redeem','direction') THEN 1 ELSE 0 END), 0)::int AS clicks
      FROM vendors v
      JOIN offers o ON o.vendor_id = v.id
      LEFT JOIN user_interactions ui
        ON ui.offer_id = o.id AND ui.created_at >= NOW() - INTERVAL '7 days'
      WHERE v.status = 'approved'
      GROUP BY v.user_id, v.business_name
      HAVING SUM(CASE WHEN ui.action IS NOT NULL THEN 1 ELSE 0 END) > 0
    `);

    if (!rows.length) {
      this.logger.log('Vendor digest: no vendor activity this week');
      return;
    }

    let sent = 0;
    for (const r of rows) {
      sent += await this.pushService.send(
        r.user_id,
        '📊 Your Weekly Report',
        `${r.business_name}: ${r.views} views, ${r.saves} saves and ${r.clicks} customer engagements this week. Post a fresh offer to keep the momentum! 🚀`,
        { route: '/vendor/analytics', type: 'vendor_digest' },
      );
    }
    this.logger.log(`Vendor digest → sent ${sent}/${rows.length}`);
  }
}
