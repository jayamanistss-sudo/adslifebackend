import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { Notification } from '../entities/notification.entity';
import { isPrimaryInstance } from '../common/utils/cron-guard';

/**
 * Monthly analytics summary email — "monthly report auto send" plan
 * feature. Same aggregation/cron-guard pattern as VendorDigestService and
 * VendorMailDigestService, but for the FULL PREVIOUS calendar month, run on
 * the 1st of each month.
 */
@Injectable()
export class VendorMonthlyReportService {
  private readonly logger = new Logger(VendorMonthlyReportService.name);

  constructor(
    private readonly mailService: MailService,
    private readonly planFeatures: PlanFeaturesService,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  // 9:00 IST on the 1st of each month — summarizes the month that just ended
  @Cron('0 9 1 * *', { name: 'vendor_monthly_report', timeZone: 'Asia/Kolkata' })
  async sendMonthlyReport() {
    if (!isPrimaryInstance()) return;
    const rows: Array<{
      vendor_id: number;
      email: string;
      name: string;
      business_name: string;
      subscription_plan: string;
      views: number;
      clicks: number;
      saves: number;
      redemptions: number;
      new_followers: number;
      new_reviews: number;
      avg_rating: number;
    }> = await this.notifRepo.manager.query(`
      SELECT v.id AS vendor_id, u.email, u.name, v.business_name, v.subscription_plan,
             COALESCE(SUM(CASE WHEN ui.action = 'view' THEN 1 ELSE 0 END), 0)::int AS views,
             COALESCE(SUM(CASE WHEN ui.action = 'click' THEN 1 ELSE 0 END), 0)::int AS clicks,
             COALESCE(SUM(CASE WHEN ui.action = 'save' THEN 1 ELSE 0 END), 0)::int AS saves,
             COALESCE(SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END), 0)::int AS redemptions,
             COALESCE((SELECT COUNT(*) FROM vendor_followers vf
                       WHERE vf.vendor_id = v.id
                         AND vf.created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
                         AND vf.created_at < date_trunc('month', NOW())), 0)::int AS new_followers,
             COALESCE((SELECT COUNT(*) FROM offer_reviews r
                       INNER JOIN offers ro ON ro.id = r.offer_id
                       WHERE ro.vendor_id = v.id
                         AND r.created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
                         AND r.created_at < date_trunc('month', NOW())), 0)::int AS new_reviews,
             COALESCE((SELECT AVG(r.rating) FROM offer_reviews r
                       INNER JOIN offers ro ON ro.id = r.offer_id
                       WHERE ro.vendor_id = v.id), 0)::float AS avg_rating
      FROM vendors v
      INNER JOIN users u ON u.id = v.user_id
      LEFT JOIN offers o ON o.vendor_id = v.id
      LEFT JOIN user_interactions ui
        ON ui.offer_id = o.id
        AND ui.created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
        AND ui.created_at < date_trunc('month', NOW())
      WHERE v.status = 'approved'
      GROUP BY v.id, u.email, u.name, v.business_name, v.subscription_plan
    `);

    if (!rows.length) {
      this.logger.log('Vendor monthly report: no approved vendors');
      return;
    }

    const monthLabel = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

    // Same fix as vendor-mail-digest.service.ts — the aggregate query above
    // already joins vendors (and now selects subscription_plan directly),
    // so there's no need for vendorHasFeature()'s own extra per-row fetch.
    let sent = 0;
    for (const r of rows) {
      if (!(await this.planFeatures.planHasFeature(r.subscription_plan ?? 'starter', 'monthly_report_auto_send'))) continue;
      await this.mailService.sendMonthlyReportEmail(r.email, r.name, r.business_name, monthLabel, {
        views: r.views, clicks: r.clicks, saves: r.saves, redemptions: r.redemptions,
        newFollowers: r.new_followers, newReviews: r.new_reviews, avgRating: +r.avg_rating,
      });
      sent++;
    }
    this.logger.log(`Vendor monthly report → sent ${sent}/${rows.length}`);
  }
}
