import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { Notification } from '../entities/notification.entity';
import { isPrimaryInstance } from '../common/utils/cron-guard';

/**
 * Daily offer-activity email digest — "offer mail notification" plan
 * feature. Mirrors VendorDigestService's weekly push pattern (same
 * aggregation shape, same cron-guard), but daily and via email instead of
 * push, gated per-vendor by the `offer_mail_notification` plan flag.
 */
@Injectable()
export class VendorMailDigestService {
  private readonly logger = new Logger(VendorMailDigestService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly planFeatures: PlanFeaturesService,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  // 9:00 IST daily
  @Cron('0 9 * * *', { name: 'vendor_mail_digest', timeZone: 'Asia/Kolkata' })
  async sendDailyDigest() {
    if (!isPrimaryInstance()) return;
    const rows: Array<{
      vendor_id: number;
      user_id: number;
      email: string;
      name: string;
      business_name: string;
      subscription_plan: string;
      views: number;
      clicks: number;
      saves: number;
      redemptions: number;
      reviews: number;
    }> = await this.notifRepo.manager.query(`
      SELECT v.id AS vendor_id, v.user_id, u.email, u.name, v.business_name, v.subscription_plan,
             COALESCE(SUM(CASE WHEN ui.action = 'view' THEN 1 ELSE 0 END), 0)::int AS views,
             COALESCE(SUM(CASE WHEN ui.action = 'click' THEN 1 ELSE 0 END), 0)::int AS clicks,
             COALESCE(SUM(CASE WHEN ui.action = 'save' THEN 1 ELSE 0 END), 0)::int AS saves,
             COALESCE(SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END), 0)::int AS redemptions,
             COALESCE((SELECT COUNT(*) FROM offer_reviews r
                       INNER JOIN offers ro ON ro.id = r.offer_id
                       WHERE ro.vendor_id = v.id AND r.created_at >= NOW() - INTERVAL '1 day'), 0)::int AS reviews
      FROM vendors v
      INNER JOIN users u ON u.id = v.user_id
      LEFT JOIN offers o ON o.vendor_id = v.id
      LEFT JOIN user_interactions ui
        ON ui.offer_id = o.id AND ui.created_at >= NOW() - INTERVAL '1 day'
      WHERE v.status = 'approved'
      GROUP BY v.id, v.user_id, u.email, u.name, v.business_name, v.subscription_plan
      HAVING SUM(CASE WHEN ui.action IS NOT NULL THEN 1 ELSE 0 END) > 0
          OR (SELECT COUNT(*) FROM offer_reviews r
              INNER JOIN offers ro ON ro.id = r.offer_id
              WHERE ro.vendor_id = v.id AND r.created_at >= NOW() - INTERVAL '1 day') > 0
    `);

    if (!rows.length) {
      this.logger.log('Vendor mail digest: no vendor activity today');
      return;
    }

    // The aggregate query above already joins vendors, so it already has
    // subscription_plan — calling vendorHasFeature() per row here re-fetched
    // it via a fresh vendorRepo.findOne() for every vendor, one extra
    // sequential query per row on top of the one query that already had it.
    let sent = 0;
    for (const r of rows) {
      if (!(await this.planFeatures.planHasFeature(r.subscription_plan ?? 'starter', 'offer_mail_notification'))) continue;
      await this.mailService.sendOfferActivityEmail(r.email, r.name, r.business_name, {
        views: r.views, clicks: r.clicks, saves: r.saves, redemptions: r.redemptions, reviews: r.reviews,
      });
      sent++;
    }
    this.logger.log(`Vendor mail digest → sent ${sent}/${rows.length}`);
  }
}
