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
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { AuthLog } from '../entities/auth-log.entity';
import { Referral } from '../entities/referral.entity';
import { Category } from '../entities/category.entity';
import { clampLimit } from '../common/utils/pagination';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { CashfreeService } from '../cashfree/cashfree.service';

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
    @InjectRepository(AuthLog) private readonly authLogRepo: Repository<AuthLog>,
    @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly monitoring: MonitoringService,
    private readonly notificationSettings: NotificationSettingsService,
    private readonly fraudDetector: FraudDetectorService,
    private readonly cashfree: CashfreeService,
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
        'u.admin_role AS admin_role',
        'u.city AS city', 'u.is_active AS is_active', 'u.created_at AS created_at',
        'COALESCE((SELECT COUNT(*) FROM user_interactions WHERE user_id=u.id),0) AS interactions',
        // Was hardcoded to a literal 0 — the real, actively-incremented
        // column already existed and just wasn't selected.
        'u.login_count AS login_count', '0 AS follows',
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

    let vendorId: number | null = null;
    // Applicants can pay for a plan during onboarding (order_id links the
    // application to that Payment row), but plenty still apply for a paid
    // plan without completing checkout — that's the normal case, not an
    // error — captured here so the approval notification can nudge them
    // toward finishing the upgrade instead of silently landing on Starter.
    let unpaidPlanName: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(VendorApplication).update(appId, {
        status, updated_at: new Date(),
        // Rejection reason previously vanished after the one-time push/email —
        // persist it so both the admin list and the applicant's own status
        // check can show it later.
        admin_note: note || null,
      });

      if (status === 'approved') {
        // Resolve the plan the applicant actually selected & paid for at
        // signup. This used to be hardcoded to 'starter' unconditionally,
        // silently downgrading anyone who paid for Growth/Pro during
        // onboarding — the payment succeeds and is recorded, but the vendor
        // row (created only here, on approval) never reflected it.
        let planSlug = 'starter';
        let planExpiresAt: Date | null = null;
        if (app.plan_id) {
          // Prefer the exact order_id this application was submitted with
          // (reliable — one payment, no ambiguity) over the fuzzy
          // user+plan match, which only ever checked reference_type
          // 'vendor_plan' and missed 'vendor_plan_annual' entirely —
          // annual payers were silently downgraded to Starter on approval.
          // Fuzzy match kept only as a fallback for applications submitted
          // before order_id existed on this table.
          const paidPayment = app.order_id
            ? await manager.getRepository(Payment).findOne({
                where: { order_id: app.order_id, status: PaymentStatus.PAID },
              })
            : await manager.getRepository(Payment).findOne({
                where: [
                  { user_id: app.user_id, reference_type: 'vendor_plan', reference_id: app.plan_id, status: PaymentStatus.PAID },
                  { user_id: app.user_id, reference_type: 'vendor_plan_annual', reference_id: app.plan_id, status: PaymentStatus.PAID },
                ],
                order: { created_at: 'DESC' },
              });
          const plan = await manager.getRepository(SubscriptionPlan).findOne({
            where: { id: app.plan_id }, select: ['name', 'slug', 'duration_days'],
          });
          if (paidPayment && plan) {
            const isAnnual = paidPayment.reference_type === 'vendor_plan_annual';
            planSlug = plan.slug;
            planExpiresAt = new Date(Date.now() + (isAnnual ? 365 : plan.duration_days) * 24 * 60 * 60 * 1000);
          } else if (plan && plan.slug !== 'starter') {
            unpaidPlanName = plan.name;
          }
        }

        const existing = await manager.getRepository(Vendor).findOne({ where: { user_id: app.user_id }, select: ['id'] });
        if (existing) {
          vendorId = existing.id;
          await manager.getRepository(Vendor).update(
            { user_id: app.user_id },
            {
              status: VendorStatus.APPROVED, review_note: note || null,
              business_name: app.business_name, category: app.category,
              city: app.city, address: app.address, phone: app.phone,
              website: app.website, gst_number: app.gst_number, description: app.description,
              lat: app.lat ?? null, lng: app.lng ?? null,
              ...(app.logo_url ? { logo_url: app.logo_url } : {}),
              // Only touch the plan if this application actually resolved a
              // freshly-paid one — don't reset an existing vendor's current
              // plan back to starter on a re-approval with no new payment.
              ...(planExpiresAt ? { subscription_plan: planSlug, plan_expires_at: planExpiresAt } : {}),
            },
          );
        } else {
          const saved = await manager.getRepository(Vendor).save({
            user_id: app.user_id, business_name: app.business_name, category: app.category,
            city: app.city, address: app.address, phone: app.phone, website: app.website,
            gst_number: app.gst_number, description: app.description,
            logo_url: app.logo_url ?? null,
            lat: app.lat ?? null, lng: app.lng ?? null,
            status: VendorStatus.APPROVED, review_note: note || null,
            subscription_plan: planSlug,
            ...(planExpiresAt ? { plan_expires_at: planExpiresAt } : {}),
          });
          vendorId = saved.id;
        }
        await manager.getRepository(User).update(app.user_id, { role: UserRole.VENDOR });
      }
    });

    // Previously the fraud scorer only ran when an admin manually requested
    // a scan on this exact vendor ID — everything it could detect (duplicate
    // name, no site/GST, bad phone pattern, missing location) went live the
    // instant an admin clicked Approve. Now it runs automatically right here;
    // a high-confidence result holds the vendor out of the feed (all feed
    // queries already gate on status='approved') instead of leaving them live.
    let heldForFraudReview = false;
    if (status === 'approved' && vendorId) {
      const fraudResult = await this.fraudDetector.checkVendor(vendorId).catch(() => null);
      if (fraudResult?.action === 'auto_reject') {
        await this.vendorRepo.update(vendorId, { status: VendorStatus.FRAUD_REVIEW });
        heldForFraudReview = true;
      }
    }

    const user = await this.userRepo.findOne({ where: { id: app.user_id }, select: ['id', 'name', 'email'] });

    if (status === 'approved' && heldForFraudReview) {
      await this.push.send(app.user_id, 'Vendor Application Under Review', 'Your application needs a bit more review before going live. We\'ll notify you shortly.', { type: 'vendor_approved', route: '/profile' });
    } else if (status === 'approved') {
      const approvedBody = unpaidPlanName
        ? `Your vendor account has been approved on Starter. Complete payment for ${unpaidPlanName} anytime to unlock it.`
        : 'Your vendor account has been approved. Start adding offers now!';
      await this.push.send(
        app.user_id, 'Vendor Approved!', approvedBody,
        { type: 'vendor_approved', route: unpaidPlanName ? '/vendor/select-plan' : '/vendor/dashboard' },
      );
      if (user?.email && await this.notificationSettings.isEnabled('vendor_approved', 'email')) {
        await this.mail.sendVendorApprovedEmail(user.email, user.name, app.business_name);
      }
    } else {
      // A paid application that gets rejected used to just sit there —
      // PAID and unrefunded — until an admin happened to notice and used
      // the separate manual refund endpoint. Auto-refund via Cashfree here
      // instead, using the same order_id link this application was
      // submitted with.
      let refunded = false;
      if (app.order_id) {
        const pay = await this.paymentRepo.findOne({ where: { order_id: app.order_id } });
        if (pay && pay.status === PaymentStatus.PAID) {
          try {
            await this.cashfree.refund(pay.order_id, `refund_vendorapp_${app.id}_${Date.now()}`);
            await this.paymentRepo.update(pay.id, { status: PaymentStatus.REFUNDED });
            refunded = true;
          } catch (e: any) {
            this.logger.error(`Auto-refund failed for declined vendor application ${app.id}: ${e?.message ?? e}`);
          }
        }
      }
      const rejectBody = refunded
        ? `${note || 'Your vendor application was not approved this time.'} Your payment has been refunded.`
        : (note || 'Your vendor application was not approved this time.');
      await this.push.send(app.user_id, 'Vendor Application Update', rejectBody, { type: 'vendor_rejected', route: '/profile' });
      if (user?.email && await this.notificationSettings.isEnabled('vendor_rejected', 'email')) {
        await this.mail.sendVendorRejectedEmail(user.email, user.name, app.business_name, note);
      }
    }

    return { updated: true, held_for_fraud_review: heldForFraudReview };
  }

  async getAdminOffers(search = '', category = '', status = '', limit = 30, offset = 0, vendorStatus = '') {
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
    // Previously no way to ask "show every offer belonging to a suspended
    // vendor" — compounded the vendor-suspend cascade gap this session
    // already fixed at the write side.
    if (vendorStatus) qb.andWhere('v.status = :vendorStatus', { vendorStatus });

    const total = await qb.getCount();
    const offers = await qb
      .select(['o.*', 'v.business_name AS business_name', 'u.email AS vendor_email', 'v.status AS vendor_status'])
      .orderBy('o.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
    return { offers, total };
  }

  // Admin could previously only toggle status — no way to fix a vendor's
  // typo'd title/price without their cooperation.
  async updateOfferContent(offerId: number, dto: Record<string, any>, adminId?: number) {
    const allowed = ['title', 'description', 'category', 'discount_percent', 'original_price', 'offer_price', 'valid_from', 'valid_until'] as const;
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) updateData[key] = dto[key];
    }
    if (dto.category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: dto.category } });
      updateData.category_id = cat?.id ?? null;
    }
    if (!Object.keys(updateData).length) throw new BadRequestException('No fields to update');
    await this.offerRepo.update(offerId, updateData);
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: 'admin_offer_edit',
        entityType: 'offer', entityId: offerId,
        description: `Admin edited offer #${offerId} content`,
        metadata: { fields: Object.keys(updateData) },
      }).catch(() => {}));
    }
    return { updated: true };
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

  async updateSiteSettings(dto: Record<string, any>, adminId?: number) {
    // getSiteSettingsAll() masks secret fields as '••••••••' before sending
    // them to the client — if that same placeholder round-trips back here
    // (a form submitted without touching the secret field), it must never
    // overwrite the real stored value with the mask itself.
    const entries = Object.entries(dto)
      .filter(([, value]) => value !== '••••••••')
      .map(([key, value]) => ({ key, value: String(value) }));
    if (!entries.length) return { updated: true };
    await this.siteSettingRepo.upsert(entries, ['key']);
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: 'admin_site_settings_update',
        entityType: 'site_settings', entityId: 0,
        description: `Admin updated site settings: ${Object.keys(dto).join(', ')}`,
        // Redact values — this endpoint also carries payment API keys.
        metadata: { keys: Object.keys(dto) },
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async getVendorRequests(status = '', limit = 30, offset = 0) {
    // plan_id was previously dropped on submit and never joined here, so the
    // payment-status badge in VendorRequests.tsx rendered blank/stale on
    // every application (fixed: vendor-apply.controller.ts now persists it).
    //
    // Previously returned the entire table unconditionally — fine at
    // current volume, but will degrade as applications accumulate. Counts
    // are computed separately (whole-table GROUP BY, not the current page)
    // so the tab badges stay accurate regardless of filter/pagination.
    limit = clampLimit(limit, 30);
    offset = Math.max(Number(offset) || 0, 0);

    const qb = this.appRepo
      .createQueryBuilder('va')
      .innerJoin(User, 'u', 'u.id = va.user_id')
      .leftJoin(SubscriptionPlan, 'sp', 'sp.id = va.plan_id')
      .select([
        'va.*', 'u.name AS user_name', 'u.email AS user_email',
        'sp.name AS plan_name', 'sp.price AS plan_price',
        `(SELECT p.status FROM payments p
            WHERE p.user_id = va.user_id AND p.reference_type = 'vendor_plan' AND p.reference_id = va.plan_id
            ORDER BY p.created_at DESC LIMIT 1) AS payment_status`,
        `(SELECT p.paid_at FROM payments p
            WHERE p.user_id = va.user_id AND p.reference_type = 'vendor_plan' AND p.reference_id = va.plan_id
            ORDER BY p.created_at DESC LIMIT 1) AS paid_at`,
      ]);
    if (status) qb.andWhere('va.status = :status', { status });

    const [apps, total, countRows] = await Promise.all([
      qb.clone().orderBy('va.created_at', 'DESC').offset(offset).limit(limit).getRawMany(),
      qb.clone().getCount(),
      this.appRepo.createQueryBuilder('va').select(['va.status AS status', 'COUNT(*) AS count']).groupBy('va.status').getRawMany(),
    ]);

    const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
    for (const r of countRows) {
      counts.all += +r.count;
      if (r.status in counts) (counts as any)[r.status] = +r.count;
    }

    return { apps, total, counts };
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

  // Gated `super`-only at the controller. Granting/revoking is itself logged,
  // and every existing super-admin is emailed so a rogue grant can't go
  // unnoticed (the core gap USR-01 in the audit — un-auditable self-promotion).
  async updateAdminRole(userId: number, adminRole: string, grantedBy: number) {
    const target = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'role', 'email', 'admin_role'] });
    if (!target) throw new NotFoundException('User not found');
    if (target.role !== UserRole.ADMIN) {
      throw new BadRequestException('Admin sub-role can only be set on accounts with role=admin');
    }
    const newRole = adminRole === '' ? null : adminRole;
    await this.userRepo.update(userId, { admin_role: newRole });

    setImmediate(() => this.monitoring.logActivity({
      userId: grantedBy, role: 'admin', action: 'admin_role_change',
      entityType: 'user', entityId: userId,
      description: `Admin sub-role for #${userId} changed: "${target.admin_role ?? ''}" -> "${newRole ?? ''}"`,
      metadata: { old_admin_role: target.admin_role, new_admin_role: newRole },
    }).catch(() => {}));

    if (newRole === 'super') {
      const supers = await this.userRepo.find({ where: { role: UserRole.ADMIN, admin_role: 'super' }, select: ['email'] });
      const notifyList = supers.map(s => s.email).filter(e => e && e !== target.email);
      if (notifyList.length) {
        this.mail.send(
          notifyList.join(','),
          'AdsLife admin alert: a new super-admin was granted',
          `<p>${target.email} was just granted the <strong>super</strong> admin sub-role by admin #${grantedBy}.</p>`,
        ).catch(() => {});
      }
    }
    return { updated: true, admin_role: newRole };
  }

  // token_invalidated_at is already enforced on every request (jwt.strategy.ts)
  // — this just sets it on demand instead of only on the user's own
  // logout/password-change, so support can end a session without a full ban.
  async forceLogout(userId: number, adminId: number) {
    await this.userRepo.update(userId, { token_invalidated_at: Date.now() as any });
    setImmediate(() => this.monitoring.logActivity({
      userId: adminId, role: 'admin', action: 'admin_force_logout',
      entityType: 'user', entityId: userId,
      description: `Admin forced logout on all devices for user #${userId}`,
    }).catch(() => {}));
    return { updated: true };
  }

  // Mirrors getVendorDetail's shape — aggregates what today requires
  // cross-referencing several separate admin list screens by hand.
  async getUserDetail(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [savedCount, referralCount, loginHistory] = await Promise.all([
      this.interactionRepo.count({ where: { user_id: userId, action: 'save' as any } }),
      this.referralRepo.count({ where: { referrer_id: userId } }),
      this.authLogRepo.find({
        where: { user_id: userId },
        order: { created_at: 'DESC' },
        take: 25,
      }),
    ]);

    const { password_hash, ...safeUser } = user as any;
    return { user: safeUser, saved_count: savedCount, referral_count: referralCount, login_history: loginHistory };
  }

  async updateOffer(offerId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    switch (action) {
      case 'activate':   await this.offerRepo.update(offerId, { is_active: true }); break;
      case 'deactivate': await this.offerRepo.update(offerId, { is_active: false }); break;
      case 'delete':     await this.offerRepo.update(offerId, { is_active: false }); break;
      case 'feature':
        await this.offerRepo.update(offerId, { is_featured: Boolean(extra.featured ?? 1) });
        break;
      default: throw new BadRequestException('Unknown action');
    }
    // Outside the automated fraud-hold path, a vendor previously only found
    // out an admin took their offer down when it silently vanished from
    // their list.
    if (action === 'deactivate' || action === 'delete') {
      const offer = await this.offerRepo
        .createQueryBuilder('o')
        .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
        .select(['o.title AS title', 'v.user_id AS "userId"'])
        .where('o.id = :offerId', { offerId })
        .getRawOne();
      if (offer?.userId) {
        await this.push.send(
          offer.userId, 'Offer taken down', `Your offer "${offer.title}" was removed by an admin. Contact support if this seems wrong.`,
          { type: 'offer_admin_removed', route: '/vendor/offers' },
        );
      }
    }
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_offer_${action}`,
        entityType: 'offer', entityId: offerId,
        description: `Admin ${action} on offer #${offerId}`,
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  // is_featured was a flat boolean with no scheduling window, ordering, or
  // dedicated management screen — just a star icon buried in the all-offers
  // grid. This is the curation surface: list + schedule + manual order.
  async getFeaturedOffers() {
    return this.offerRepo
      .createQueryBuilder('o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_featured = true')
      .select(['o.*', 'v.business_name AS business_name'])
      .orderBy('o.featured_order', 'ASC', 'NULLS LAST')
      .addOrderBy('o.created_at', 'DESC')
      .getRawMany();
  }

  async setFeatured(
    offerId: number,
    data: { featured: boolean; featured_start_at?: string | null; featured_until?: string | null },
    adminId?: number,
  ) {
    const updateData: Record<string, any> = { is_featured: data.featured };
    if (!data.featured) {
      updateData.featured_start_at = null;
      updateData.featured_until = null;
      updateData.featured_order = null;
    } else {
      updateData.featured_start_at = data.featured_start_at ?? null;
      updateData.featured_until = data.featured_until ?? null;
      // New featured offers go to the end of the manually-ordered list.
      const maxOrder = await this.offerRepo
        .createQueryBuilder('o')
        .select('MAX(o.featured_order)', 'max')
        .where('o.is_featured = true')
        .getRawOne();
      updateData.featured_order = (maxOrder?.max ?? 0) + 1;
    }
    await this.offerRepo.update(offerId, updateData);
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: data.featured ? 'admin_offer_feature' : 'admin_offer_unfeature',
        entityType: 'offer', entityId: offerId,
        description: `Admin ${data.featured ? 'featured' : 'unfeatured'} offer #${offerId}`,
        metadata: data,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async reorderFeatured(orderedIds: number[]) {
    if (!orderedIds.length) return { updated: true };
    // Was one UPDATE per item in a Promise.all loop — a single bulk
    // statement instead, matched by position via UNNEST's ordinality
    // (1-indexed, so subtract 1 to match the original 0-indexed order).
    await this.dataSource.query(
      `UPDATE offers SET featured_order = v.ord - 1
       FROM (SELECT id, ord FROM UNNEST($1::int[]) WITH ORDINALITY AS t(id, ord)) AS v
       WHERE offers.id = v.id`,
      [orderedIds],
    );
    return { updated: true };
  }

  async updateVendor(vendorId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    let cascadedOffers = 0;

    if (action === 'suspend' || action === 'reject') {
      const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
      if (!vendor) throw new NotFoundException('Vendor not found');

      const newStatus = action === 'suspend' ? VendorStatus.SUSPENDED : VendorStatus.REJECTED;
      await this.dataSource.transaction(async (manager) => {
        // note was previously accepted by the DTO and silently discarded —
        // now persisted the same way the initial application review already does.
        await manager.getRepository(Vendor).update(vendorId, { status: newStatus, review_note: extra.note || null });
        if (action === 'suspend') {
          // A suspended vendor's offers previously stayed live indefinitely —
          // no cascade existed at all. Reactivation on unsuspend is a
          // deliberate manual step, not automatic (some offers may have been
          // independently deactivated before the suspension for other reasons).
          const result = await manager.getRepository(Offer).update(
            { vendor_id: vendorId, is_active: true }, { is_active: false },
          );
          cascadedOffers = result.affected ?? 0;
        }
      });

      // This later-stage suspend/reject path never notified the vendor at
      // all — they'd only discover it when their offers stopped showing.
      const user = await this.userRepo.findOne({ where: { id: vendor.user_id }, select: ['id', 'name', 'email'] });
      const notifType = action === 'suspend' ? 'vendor_suspended' : 'vendor_rejected';
      const title = action === 'suspend' ? 'Vendor Account Suspended' : 'Vendor Account Update';
      const body = extra.note || (action === 'suspend'
        ? 'Your vendor account has been suspended. Contact support for details.'
        : 'Your vendor account status was updated.');
      if (user) {
        await this.push.send(user.id, title, body, { type: notifType });
        if (user.email && await this.notificationSettings.isEnabled(notifType, 'email')) {
          await this.mail.sendStatusEmail(user.email, user.name, title, body);
        }
      }
    } else {
      switch (action) {
        case 'approve': await this.vendorRepo.update(vendorId, { status: VendorStatus.APPROVED }); break;
        case 'update_plan': {
          if (!extra.plan) throw new BadRequestException('Plan is required');
          const dbPlan = extra.plan !== 'starter'
            ? await this.planRepo.findOne({ where: { slug: extra.plan }, select: ['slug'] })
            : null;
          if (!dbPlan && extra.plan !== 'starter') throw new BadRequestException('Invalid plan');
          await this.vendorRepo.update(vendorId, { subscription_plan: extra.plan });
          break;
        }
        default: throw new BadRequestException('Unknown vendor action');
      }
    }

    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_vendor_${action}`,
        entityType: 'vendor', entityId: vendorId,
        description: `Admin ${action} on vendor #${vendorId}`
          + (cascadedOffers ? ` — deactivated ${cascadedOffers} offer(s)` : ''),
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true, ...(action === 'suspend' ? { cascaded_offers: cascadedOffers } : {}) };
  }

  async bulkUpdateVendorPlan(vendorIds: number[], plan: string, adminId: number) {
    if (plan !== 'starter') {
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
