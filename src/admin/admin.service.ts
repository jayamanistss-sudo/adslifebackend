import { Logger, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { MailService } from '../mail/mail.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { User, UserRole } from '../entities/user.entity';
import { Vendor, VendorStatus } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { VendorApplication } from '../entities/vendor-application.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { FraudFlag, FraudFlagStatus } from '../entities/fraud-flag.entity';
import { Payment } from '../entities/payment.entity';
import { clampLimit } from '../common/utils/pagination';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(SiteSetting) private readonly siteSettingRepo: Repository<SiteSetting>,
    @InjectRepository(VendorDailyStat) private readonly dailyStatRepo: Repository<VendorDailyStat>,
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
    @InjectRepository(VendorApplication) private readonly appRepo: Repository<VendorApplication>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(FraudFlag) private readonly fraudFlagRepo: Repository<FraudFlag>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly monitoring: MonitoringService,
    private readonly notificationSettings: NotificationSettingsService,
  ) {}

  async getStats() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers, approvedVendors, activeOffers, totalOffers,
      pendingApps, openTickets, fraudFlags,
      rev, thisMonthUsers, lastMonthUsers, totalInteractions, todayInteractions,
      roles, dailyUsers, recentUsers, recentVendors,
    ] = await Promise.all([
      this.userRepo.count(),
      this.vendorRepo.count({ where: { status: VendorStatus.APPROVED } }),
      this.offerRepo.count({ where: { is_active: true } }),
      this.offerRepo.count(),
      this.appRepo.count({ where: { status: 'pending' } }),
      // support_tickets not exposed as repo here — use QB
      this.dataSource.createQueryBuilder().select('COUNT(*)', 'cnt').from('support_tickets', 's').where("s.status = 'open'").getRawOne(),
      this.fraudFlagRepo.count({ where: { status: FraudFlagStatus.PENDING } }),
      this.paymentRepo.createQueryBuilder('p').select('COALESCE(SUM(p.amount),0)', 'total').where("p.status = 'paid'").getRawOne(),
      this.userRepo.createQueryBuilder('u').where('u.created_at >= :start', { start: thisMonthStart }).getCount(),
      this.userRepo.createQueryBuilder('u').where('u.created_at >= :start AND u.created_at < :end', { start: lastMonthStart, end: thisMonthStart }).getCount(),
      this.interactionRepo.count(),
      this.interactionRepo.createQueryBuilder('ui').where('ui.created_at >= :today', { today }).getCount(),
      this.userRepo.createQueryBuilder('u').select(['u.role AS role', 'COUNT(*) AS cnt']).groupBy('u.role').getRawMany(),
      this.userRepo.createQueryBuilder('u').select(['u.created_at::date AS d', 'COUNT(*) AS cnt']).where('u.created_at >= :since', { since: new Date(Date.now() - 7 * 86400000) }).groupBy('u.created_at::date').orderBy('d', 'ASC').getRawMany(),
      this.userRepo.find({ select: ['id', 'name', 'email', 'role', 'created_at'], order: { created_at: 'DESC' }, take: 5 }),
      this.vendorRepo.createQueryBuilder('v').innerJoin(User, 'u', 'u.id = v.user_id').select(['v.id AS id', 'v.business_name AS business_name', 'v.status AS status', 'v.subscription_plan AS subscription_plan', 'v.created_at AS created_at', 'u.email AS email']).orderBy('v.created_at', 'DESC').limit(5).getRawMany(),
    ]);

    // banner_ad_requests and spotlight_requests don't have entity files; use QB
    const [pendingBanners, pendingSpotlights] = await Promise.all([
      this.dataSource.createQueryBuilder().select('COUNT(*)', 'cnt').from('banner_ad_requests', 'b').where("b.status = 'pending'").getRawOne(),
      this.dataSource.createQueryBuilder().select('COUNT(*)', 'cnt').from('spotlight_requests', 'sr').where("sr.status = 'pending'").getRawOne(),
    ]);

    const roleBreakdown: Record<string, number> = { user: 0, vendor: 0, admin: 0 };
    for (const r of roles) roleBreakdown[r.role] = +r.cnt;

    const tm = thisMonthUsers, lm = lastMonthUsers;
    let growth = 0;
    if (lm > 0) growth = Math.round(((tm - lm) / lm) * 1000) / 10;
    else if (tm > 0) growth = 100;

    return {
      totals: {
        users: totalUsers, vendors: approvedVendors, offers: activeOffers,
        total_offers: totalOffers, interactions: totalInteractions,
        revenue: Math.round(+rev?.total * 100) / 100,
      },
      pending: {
        vendors: pendingApps, tickets: +openTickets?.cnt || 0,
        banners: +pendingBanners?.cnt || 0, spotlights: +pendingSpotlights?.cnt || 0,
        fraud: fraudFlags,
      },
      users: { this_month: tm, last_month: lm, growth_pct: growth, today_active: todayInteractions, role_breakdown: roleBreakdown },
      daily_signups: dailyUsers,
      recent_users: recentUsers,
      recent_vendors: recentVendors,
    };
  }

  async getUsers(page = 1, search = '', role = '', status = '', limit = 30) {
    limit = clampLimit(limit, 30);
    const offset = (Math.max(page, 1) - 1) * limit;
    const qb = this.userRepo.createQueryBuilder('u');
    if (search) qb.andWhere('(u.name LIKE :s OR u.email LIKE :s OR u.city LIKE :s)', { s: `%${search}%` });
    if (role) qb.andWhere('u.role = :role', { role });
    if (status === 'active') qb.andWhere('u.is_active = true');
    else if (status === 'banned') qb.andWhere('u.is_active = false');

    const total = await qb.getCount();
    const users = await qb
      .select([
        'u.id AS id', 'u.name AS name', 'u.email AS email', 'u.role AS role',
        'u.city AS city', 'u.is_active AS is_active', 'u.created_at AS created_at',
        'COALESCE((SELECT COUNT(*) FROM user_interactions WHERE user_id=u.id),0) AS interactions',
        '0 AS login_count', '0 AS follows',
      ])
      .orderBy('u.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
    return { users, total };
  }

  async getVendors(search = '', status = '', plan = '', limit = 30, offset = 0) {
    limit = clampLimit(limit, 30);
    offset = Math.max(Number(offset) || 0, 0);
    const qb = this.vendorRepo
      .createQueryBuilder('v')
      .innerJoin(User, 'u', 'u.id = v.user_id');
    if (status) qb.andWhere('v.status = :status', { status });
    if (plan) qb.andWhere('v.subscription_plan = :plan', { plan });
    if (search) qb.andWhere('(v.business_name LIKE :s OR u.email LIKE :s OR v.city LIKE :s)', { s: `%${search}%` });

    const total = await qb.getCount();
    const vendors = await qb
      .select([
        'v.*', 'u.name AS owner_name', 'u.email AS owner_email', 'u.is_active AS user_active',
        'COUNT(DISTINCT o.id) AS total_offers',
        'COUNT(DISTINCT CASE WHEN o.is_active = true THEN o.id END) AS active_offers',
        'COALESCE(SUM(o.views), 0) AS total_views',
        'COALESCE(SUM(o.clicks), 0) AS total_clicks',
        'COUNT(DISTINCT vf.user_id) AS total_followers',
      ])
      .leftJoin(Offer, 'o', 'o.vendor_id = v.id')
      .leftJoin('vendor_followers', 'vf', 'vf.vendor_id = v.id')
      .groupBy('v.id, u.name, u.email, u.is_active')
      .orderBy('v.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
    return { vendors, total };
  }

  async getVendorDetail(vendorId: number) {
    const row = await this.vendorRepo
      .createQueryBuilder('v')
      .innerJoin(User, 'u', 'u.id = v.user_id')
      .leftJoin(Offer, 'o', 'o.vendor_id = v.id')
      .leftJoin('vendor_followers', 'vf', 'vf.vendor_id = v.id')
      .select([
        'v.*',
        'u.name AS owner_name', 'u.email AS owner_email', 'u.phone AS owner_phone',
        'u.is_active AS user_active', 'u.created_at AS user_created_at',
        'COUNT(DISTINCT o.id) AS total_offers',
        'COUNT(DISTINCT CASE WHEN o.is_active = true THEN o.id END) AS active_offers',
        'COALESCE(SUM(o.views), 0) AS total_views',
        'COALESCE(SUM(o.clicks), 0) AS total_clicks',
        'COALESCE(SUM(o.saves), 0) AS total_saves',
        'COALESCE(SUM(o.current_redemptions), 0) AS total_redemptions',
        'COUNT(DISTINCT vf.user_id) AS total_followers',
      ])
      .where('v.id = :vendorId', { vendorId })
      .groupBy('v.id, u.name, u.email, u.phone, u.is_active, u.created_at')
      .getRawOne();

    if (!row) throw new NotFoundException('Vendor not found');

    const offers = await this.offerRepo.find({
      where: { vendor_id: vendorId },
      order: { created_at: 'DESC' },
      take: 20,
    });

    const application = await this.appRepo.findOne({
      where: { user_id: row.user_id },
      order: { created_at: 'DESC' },
    });

    return { vendor: row, offers, application };
  }

  async reviewVendor(appId: number, status: string, note: string) {
    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) throw new BadRequestException('Invalid status');

    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('Application not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(VendorApplication).update(appId, { status });

      if (status === 'approved') {
        const existing = await manager.getRepository(Vendor).findOne({ where: { user_id: app.user_id }, select: ['id'] });
        if (existing) {
          await manager.getRepository(Vendor).update(
            { user_id: app.user_id },
            {
              status: VendorStatus.APPROVED, review_note: note || null,
              business_name: app.business_name, category: app.category,
              city: app.city, address: app.address, phone: app.phone,
              website: app.website, gst_number: app.gst_number, description: app.description,
              lat: app.lat ?? null, lng: app.lng ?? null,
              ...(app.logo_url ? { logo_url: app.logo_url } : {}),
            },
          );
        } else {
          await manager.getRepository(Vendor).save({
            user_id: app.user_id, business_name: app.business_name, category: app.category,
            city: app.city, address: app.address, phone: app.phone, website: app.website,
            gst_number: app.gst_number, description: app.description,
            logo_url: app.logo_url ?? null,
            lat: app.lat ?? null, lng: app.lng ?? null,
            status: VendorStatus.APPROVED, review_note: note || null, subscription_plan: 'free',
          });
        }
        await manager.getRepository(User).update(app.user_id, { role: UserRole.VENDOR });
      }
    });

    const user = await this.userRepo.findOne({ where: { id: app.user_id }, select: ['id', 'name', 'email'] });

    if (status === 'approved') {
      await this.push.send(app.user_id, 'Vendor Approved!', 'Your vendor account has been approved. Start adding offers now!', { type: 'vendor_approved' });
      if (user?.email && await this.notificationSettings.isEnabled('vendor_approved', 'email')) {
        await this.mail.sendVendorApprovedEmail(user.email, user.name, app.business_name);
      }
    } else {
      await this.push.send(app.user_id, 'Vendor Application Update', note || 'Your vendor application was not approved this time.', { type: 'vendor_rejected' });
      if (user?.email && await this.notificationSettings.isEnabled('vendor_rejected', 'email')) {
        await this.mail.sendVendorRejectedEmail(user.email, user.name, app.business_name, note);
      }
    }

    return { updated: true };
  }

  async getAdminOffers(search = '', category = '', status = '', limit = 30, offset = 0) {
    limit = clampLimit(limit, 30);
    offset = Math.max(Number(offset) || 0, 0);
    const qb = this.offerRepo
      .createQueryBuilder('o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .innerJoin(User, 'u', 'u.id = v.user_id');
    if (status === 'active') qb.andWhere('o.is_active = true');
    else if (status === 'inactive') qb.andWhere('o.is_active = false');
    else if (status === 'expired') qb.andWhere('o.valid_until < NOW()');
    if (category) qb.andWhere('o.category = :category', { category });
    if (search) qb.andWhere('(o.title LIKE :s OR v.business_name LIKE :s)', { s: `%${search}%` });

    const total = await qb.getCount();
    const offers = await qb
      .select(['o.*', 'v.business_name AS business_name', 'u.email AS vendor_email'])
      .orderBy('o.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
    return { offers, total };
  }

  async broadcast(title: string, body: string, data: Record<string, string> = {}, adminId?: number) {
    const users = await this.userRepo.find({ where: { is_active: true }, select: ['id'] });
    const ids = users.map(u => u.id);
    const sent = await this.push.send(ids, title, body, data);
    // Audit trail: who sent what to how many
    this.logger.log(`BROADCAST by admin ${adminId ?? '?'}: "${title}" -> ${sent}/${ids.length} users`);
    return { sent, total: ids.length };
  }

  async getSiteSettings() {
    const rows = await this.siteSettingRepo.find();
    const settings: Record<string, any> = {};
    for (const r of rows) settings[r.key] = r.value;
    return settings;
  }

  async updateSiteSettings(dto: Record<string, any>) {
    const entries = Object.entries(dto).map(([key, value]) => ({ key, value: String(value) }));
    await this.siteSettingRepo.upsert(entries, ['key']);
    return { updated: true };
  }

  async getVendorRequests() {
    return this.appRepo
      .createQueryBuilder('va')
      .innerJoin(User, 'u', 'u.id = va.user_id')
      .select(['va.*', 'u.name AS user_name', 'u.email AS user_email'])
      .orderBy('va.created_at', 'DESC')
      .getRawMany();
  }

  async updateUser(userId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    switch (action) {
      case 'ban':    await this.userRepo.update(userId, { is_active: false }); break;
      case 'unban':  await this.userRepo.update(userId, { is_active: true }); break;
      case 'delete': await this.userRepo.update(userId, { is_active: false }); break;
      case 'update_role': {
        const allowedRoles = ['user', 'vendor', 'admin'];
        if (!allowedRoles.includes(extra.role)) throw new BadRequestException('Invalid role');
        await this.userRepo.update(userId, { role: extra.role as UserRole });
        break;
      }
      default: throw new BadRequestException('Unknown action');
    }
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_user_${action}`,
        entityType: 'user', entityId: userId,
        description: `Admin ${action} on user #${userId}`,
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async updateOffer(offerId: number, action: string, extra: Record<string, any> = {}) {
    switch (action) {
      case 'activate':   await this.offerRepo.update(offerId, { is_active: true }); break;
      case 'deactivate': await this.offerRepo.update(offerId, { is_active: false }); break;
      case 'delete':     await this.offerRepo.update(offerId, { is_active: false }); break;
      case 'feature':
        await this.offerRepo.update(offerId, { is_featured: Boolean(extra.featured ?? 1) });
        break;
      default: throw new BadRequestException('Unknown action');
    }
    return { updated: true };
  }

  async updateVendor(vendorId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    switch (action) {
      case 'approve':  await this.vendorRepo.update(vendorId, { status: VendorStatus.APPROVED }); break;
      case 'reject':   await this.vendorRepo.update(vendorId, { status: VendorStatus.REJECTED }); break;
      case 'suspend':  await this.vendorRepo.update(vendorId, { status: VendorStatus.SUSPENDED }); break;
      case 'update_plan': {
        if (!extra.plan) throw new BadRequestException('Plan is required');
        const dbPlan = extra.plan !== 'free'
          ? await this.planRepo.findOne({ where: { slug: extra.plan }, select: ['slug'] })
          : null;
        if (!dbPlan && extra.plan !== 'free') throw new BadRequestException('Invalid plan');
        await this.vendorRepo.update(vendorId, { subscription_plan: extra.plan });
        break;
      }
      default: throw new BadRequestException('Unknown vendor action');
    }
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_vendor_${action}`,
        entityType: 'vendor', entityId: vendorId,
        description: `Admin ${action} on vendor #${vendorId}`,
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async bulkUpdateVendorPlan(vendorIds: number[], plan: string, adminId: number) {
    if (plan !== 'free') {
      const dbPlan = await this.planRepo.findOne({ where: { slug: plan, is_active: true }, select: ['slug'] });
      if (!dbPlan) throw new BadRequestException('Invalid or inactive plan');
    }

    await this.vendorRepo
      .createQueryBuilder()
      .update()
      .set({ subscription_plan: plan })
      .whereInIds(vendorIds)
      .execute();

    setImmediate(() => this.monitoring.logActivity({
      userId: adminId, role: 'admin', action: 'admin_bulk_update_plan',
      entityType: 'vendor', entityId: 0,
      description: `Bulk plan update to "${plan}" for ${vendorIds.length} vendor(s)`,
      metadata: { vendor_ids: vendorIds, plan },
    }).catch(() => {}));

    return { updated: vendorIds.length, plan };
  }

  async syncDailyStats(targetDate?: string) {
    const date = targetDate ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // TypeORM's InsertQueryBuilder doesn't reliably support INSERT ... SELECT
    // combined with .orUpdate() (the subquery's columns don't map onto the
    // conflict target correctly) — plain SQL is the right tool for this
    // INSERT-SELECT upsert.
    await this.dataSource.query(
      `INSERT INTO vendor_daily_stats (vendor_id, stat_date, impressions, clicks, saves, redemptions)
       SELECT
         o.vendor_id,
         $1::date,
         COALESCE(SUM(CASE WHEN ui.action = 'view'   THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ui.action = 'click'  THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END), 0)
       FROM user_interactions ui
       INNER JOIN offers o ON o.id = ui.offer_id
       WHERE ui.created_at::date = $1::date
       GROUP BY o.vendor_id
       ON CONFLICT (vendor_id, stat_date) DO UPDATE SET
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         saves = EXCLUDED.saves,
         redemptions = EXCLUDED.redemptions`,
      [date],
    );

    const affected = await this.dailyStatRepo.count({ where: { stat_date: date as any } });
    return { synced: true, date, vendor_rows: affected };
  }
}
