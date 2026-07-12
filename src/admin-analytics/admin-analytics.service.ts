import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLog, AuthAction } from '../entities/auth-log.entity';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { Payment } from '../entities/payment.entity';
import { Category } from '../entities/category.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(AuthLog) private readonly authLogRepo: Repository<AuthLog>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(VendorDailyStat) private readonly dailyStatRepo: Repository<VendorDailyStat>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationOutbox) private readonly outboxRepo: Repository<NotificationOutbox>,
  ) {}

  // ─── Logins & session activity ───────────────────────────────────────────
  async logins(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const since7 = new Date(Date.now() - 7 * 86400000);

    const [dailyLogins, actionCounts, activeUsers7d, activeUsers30d, topActiveUsers] = await Promise.all([
      this.authLogRepo.createQueryBuilder('l')
        .select(['l.created_at::date AS d', 'COUNT(*) AS cnt'])
        .where('l.action = :a AND l.created_at >= :since', { a: AuthAction.LOGIN_SUCCESS, since })
        .groupBy('l.created_at::date').orderBy('d', 'ASC').getRawMany(),
      this.authLogRepo.createQueryBuilder('l')
        .select(['l.action AS action', 'COUNT(*) AS cnt'])
        .where('l.action IN (:...actions) AND l.created_at >= :since', { actions: [AuthAction.LOGIN_SUCCESS, AuthAction.LOGIN_FAILURE], since })
        .groupBy('l.action').getRawMany(),
      this.authLogRepo.createQueryBuilder('l')
        .select('COUNT(DISTINCT l.user_id)', 'cnt')
        .where('l.action = :a AND l.created_at >= :since7', { a: AuthAction.LOGIN_SUCCESS, since7 })
        .getRawOne(),
      this.authLogRepo.createQueryBuilder('l')
        .select('COUNT(DISTINCT l.user_id)', 'cnt')
        .where('l.action = :a AND l.created_at >= :since', { a: AuthAction.LOGIN_SUCCESS, since })
        .getRawOne(),
      this.authLogRepo.createQueryBuilder('l')
        .innerJoin(User, 'u', 'u.id = l.user_id')
        .select(['l.user_id AS user_id', 'u.name AS name', 'u.email AS email', 'u.role AS role', 'COUNT(*) AS login_count'])
        .where('l.action = :a AND l.created_at >= :since', { a: AuthAction.LOGIN_SUCCESS, since })
        .groupBy('l.user_id, u.name, u.email, u.role')
        .orderBy('login_count', 'DESC').limit(10).getRawMany(),
    ]);

    const success = +(actionCounts.find((r) => r.action === AuthAction.LOGIN_SUCCESS)?.cnt ?? 0);
    const failure = +(actionCounts.find((r) => r.action === AuthAction.LOGIN_FAILURE)?.cnt ?? 0);

    return {
      daily_logins: dailyLogins,
      login_success_count: success,
      login_failure_count: failure,
      login_success_rate: success + failure > 0 ? +((success / (success + failure)) * 100).toFixed(1) : 100,
      active_users_7d: +(activeUsers7d?.cnt ?? 0),
      active_users_30d: +(activeUsers30d?.cnt ?? 0),
      top_active_users: topActiveUsers,
    };
  }

  // ─── Vendor activity ──────────────────────────────────────────────────────
  async vendorActivity(days = 30) {
    const since = new Date(Date.now() - days * 86400000);

    const [vendorSignupTrend, offersTrend, redemptionTrend, topVendors, vendorsByPlan, vendorLastActive] = await Promise.all([
      this.vendorRepo.createQueryBuilder('v')
        .select(['v.created_at::date AS d', 'COUNT(*) AS cnt'])
        .where('v.created_at >= :since', { since })
        .groupBy('v.created_at::date').orderBy('d', 'ASC').getRawMany(),
      this.offerRepo.createQueryBuilder('o')
        .select(['o.created_at::date AS d', 'COUNT(*) AS cnt'])
        .where('o.created_at >= :since', { since })
        .groupBy('o.created_at::date').orderBy('d', 'ASC').getRawMany(),
      this.dailyStatRepo.createQueryBuilder('s')
        .select(['s.stat_date AS d', 'COALESCE(SUM(s.redemptions),0) AS cnt'])
        .where('s.stat_date >= :since', { since })
        .groupBy('s.stat_date').orderBy('d', 'ASC').getRawMany(),
      this.offerRepo.createQueryBuilder('o')
        .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
        .select([
          'v.id AS vendor_id', 'v.business_name AS business_name', 'v.subscription_plan AS subscription_plan',
          'COALESCE(SUM(o.views),0) AS views', 'COALESCE(SUM(o.clicks),0) AS clicks', 'COALESCE(SUM(o.current_redemptions),0) AS redemptions',
        ])
        .groupBy('v.id, v.business_name, v.subscription_plan')
        .orderBy('redemptions', 'DESC').limit(10).getRawMany(),
      this.vendorRepo.createQueryBuilder('v')
        .select(['v.subscription_plan AS plan', 'COUNT(*) AS cnt'])
        .groupBy('v.subscription_plan').orderBy('cnt', 'DESC').getRawMany(),
      this.vendorRepo.createQueryBuilder('v')
        .innerJoin(User, 'u', 'u.id = v.user_id')
        .select(['v.id AS vendor_id', 'v.business_name AS business_name', 'u.last_login AS last_login'])
        .orderBy('u.last_login', 'DESC', 'NULLS LAST').limit(10).getRawMany(),
    ]);

    return {
      vendor_signup_trend: vendorSignupTrend,
      offers_posted_trend: offersTrend,
      redemption_trend: redemptionTrend,
      top_vendors: topVendors,
      vendors_by_plan: vendorsByPlan,
      vendor_last_active: vendorLastActive,
    };
  }

  // ─── Geography (city as the "zone" grouping key) ─────────────────────────
  async geography(limit = 10) {
    const [usersByCity, vendorsByCity, redemptionsByCity, revenueByCity] = await Promise.all([
      this.userRepo.createQueryBuilder('u')
        .select(['u.city AS city', 'COUNT(*) AS cnt'])
        .where('u.city IS NOT NULL')
        .groupBy('u.city').orderBy('cnt', 'DESC').limit(limit).getRawMany(),
      this.vendorRepo.createQueryBuilder('v')
        .select(['v.city AS city', 'COUNT(*) AS cnt'])
        .where('v.city IS NOT NULL')
        .groupBy('v.city').orderBy('cnt', 'DESC').limit(limit).getRawMany(),
      this.offerRepo.createQueryBuilder('o')
        .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
        .select(['v.city AS city', 'COALESCE(SUM(o.current_redemptions),0) AS cnt'])
        .where('v.city IS NOT NULL')
        .groupBy('v.city').orderBy('cnt', 'DESC').limit(limit).getRawMany(),
      this.paymentRepo.createQueryBuilder('p')
        .innerJoin(User, 'u', 'u.id = p.user_id')
        .select(['u.city AS city', 'COALESCE(SUM(p.amount),0) AS total'])
        .where("p.status = 'paid' AND u.city IS NOT NULL")
        .groupBy('u.city').orderBy('total', 'DESC').limit(limit).getRawMany(),
    ]);

    return {
      users_by_city: usersByCity,
      vendors_by_city: vendorsByCity,
      redemptions_by_city: redemptionsByCity,
      revenue_by_city: revenueByCity,
    };
  }

  // Categories only ever surfaced a live offer-count (used to sort the
  // public browse list) — no admin visibility into which drive views/
  // clicks/redemptions, a natural question for deciding what to promote.
  async categoryPerformance(limit = 20) {
    const rows = await this.offerRepo
      .createQueryBuilder('o')
      .innerJoin(Category, 'c', 'c.id = o.category_id')
      .select([
        'c.name AS category', 'c.slug AS slug',
        'COUNT(DISTINCT o.id) AS offer_count',
        'COALESCE(SUM(o.views),0) AS total_views',
        'COALESCE(SUM(o.clicks),0) AS total_clicks',
        'COALESCE(SUM(o.saves),0) AS total_saves',
        'COALESCE(SUM(o.current_redemptions),0) AS total_redemptions',
      ])
      .groupBy('c.id, c.name, c.slug')
      .orderBy('total_views', 'DESC')
      .limit(limit)
      .getRawMany();
    return { by_category: rows };
  }

  // Notification work (templates, AI generation, per-activity toggles) had
  // no visibility into whether any of it actually performs — admin could
  // see template counts, never open/delivery rates.
  async campaignAnalytics(days = 30) {
    const since = new Date(Date.now() - days * 86400000);

    const [sentByType, openedByType, deliveryByStatus] = await Promise.all([
      this.notificationRepo.createQueryBuilder('n')
        .select(['n.type AS type', 'COUNT(*) AS sent'])
        .where('n.created_at >= :since', { since })
        .groupBy('n.type').orderBy('sent', 'DESC').getRawMany(),
      this.notificationRepo.createQueryBuilder('n')
        .select(['n.type AS type', 'COUNT(*) AS opened'])
        .where('n.created_at >= :since AND n.is_read = true', { since })
        .groupBy('n.type').getRawMany(),
      this.outboxRepo.createQueryBuilder('o')
        .select(['o.status AS status', 'COUNT(*) AS cnt'])
        .where('o.created_at >= :since', { since })
        .groupBy('o.status').getRawMany(),
    ]);

    const openedMap = Object.fromEntries(openedByType.map((r: any) => [r.type, +r.opened]));
    const byType = sentByType.map((r: any) => ({
      type: r.type,
      sent: +r.sent,
      opened: openedMap[r.type] ?? 0,
      open_rate: +r.sent > 0 ? Math.round(((openedMap[r.type] ?? 0) / +r.sent) * 1000) / 10 : 0,
    }));

    return { by_type: byType, delivery_by_status: deliveryByStatus };
  }
}
