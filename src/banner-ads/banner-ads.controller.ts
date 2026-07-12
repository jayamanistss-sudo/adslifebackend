import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException, Query, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { BannerAdRequest } from '../entities/banner-ad-request.entity';
import { BannerPlan } from '../entities/banner-plan.entity';
import { BannerImpression } from '../entities/banner-impression.entity';
import { BannerClick } from '../entities/banner-click.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { RequestBannerAdDto, ReviewBannerAdDto } from './dto/banner-ads.dto';
import { CashfreeService } from '../cashfree/cashfree.service';
import { PushService } from '../services/push.service';
import { MailService } from '../mail/mail.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';

@ApiTags('banner-ads')
@Controller('banner-ads')
export class BannerAdsController {
  // Anonymous view/click dedupe — mirrors OffersService.trackView's
  // in-memory IP+hour cache (offers.service.ts). Signed-in users dedupe
  // against the DB instead, same as that same pattern.
  private static readonly viewCache = new Map<string, number>();
  private static readonly clickCache = new Map<string, number>();

  constructor(
    @InjectRepository(BannerAdRequest) private readonly bannerRepo: Repository<BannerAdRequest>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(BannerPlan) private readonly bannerPlanRepo: Repository<BannerPlan>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(BannerImpression) private readonly impressionRepo: Repository<BannerImpression>,
    @InjectRepository(BannerClick) private readonly clickRepo: Repository<BannerClick>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly cashfreeService: CashfreeService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly notificationSettings: NotificationSettingsService,
  ) {}

  private async notifyVendorUser(vendorId: number): Promise<{ id: number; name: string; email: string | null } | null> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['user_id'] });
    if (!vendor) return null;
    const user = await this.userRepo.findOne({ where: { id: vendor.user_id }, select: ['id', 'name', 'email'] });
    return user ?? null;
  }

  @Public()
  @Get()
  async list() {
    // Only PAID + live banners are shown to the public. Approved-but-unpaid
    // requests stay hidden until the vendor completes payment.
    const requests = await this.bannerRepo
      .createQueryBuilder('ba')
      .where("ba.status = 'live'")
      .andWhere('(ba.expires_at IS NULL OR ba.expires_at > NOW())')
      .orderBy('ba.created_at', 'DESC')
      .getMany();

    const vendorIds = [...new Set(requests.map((r) => r.vendor_id))];
    const vendors = vendorIds.length
      ? await this.vendorRepo.find({ where: { id: In(vendorIds) }, select: ['id', 'business_name', 'logo_url'] })
      : [];
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const data = requests.map((r) => ({
      id: r.id,
      title: r.title,
      image_url: r.image_url,
      media_type: r.media_type,
      target_url: r.target_url,
      position: r.position,
      business_name: vendorMap.get(r.vendor_id)?.business_name ?? null,
      vendor_logo: vendorMap.get(r.vendor_id)?.logo_url ?? null,
      expires_at: r.expires_at,
    }));
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Get('my')
  async listMine(@CurrentUser() user: any) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) return { success: true, data: [] };

    const requests = await this.bannerRepo.find({ where: { vendor_id: vendor.id }, order: { created_at: 'DESC' } });
    const withPlans = await this.attachPlanNames(requests);
    const data = await this.attachStats(withPlans);
    return { success: true, data };
  }

  // No banner ad click/view tracking existed at all — a vendor had no way
  // to know whether their (paid) banner was actually being seen or tapped.
  private async attachStats<T extends { id: number }>(requests: T[]) {
    const bannerIds = requests.map((r) => r.id);
    if (!bannerIds.length) return requests.map((r) => ({ ...r, views: 0, clicks: 0 }));

    const [viewRows, clickRows] = await Promise.all([
      this.impressionRepo.createQueryBuilder('bi')
        .select('bi.banner_id', 'banner_id').addSelect('COUNT(*)', 'cnt')
        .where('bi.banner_id IN (:...ids)', { ids: bannerIds })
        .groupBy('bi.banner_id').getRawMany(),
      this.clickRepo.createQueryBuilder('bc')
        .select('bc.banner_id', 'banner_id').addSelect('COUNT(*)', 'cnt')
        .where('bc.banner_id IN (:...ids)', { ids: bannerIds })
        .groupBy('bc.banner_id').getRawMany(),
    ]);
    const viewMap = new Map(viewRows.map((r) => [Number(r.banner_id), Number(r.cnt)]));
    const clickMap = new Map(clickRows.map((r) => [Number(r.banner_id), Number(r.cnt)]));
    return requests.map((r) => ({ ...r, views: viewMap.get(r.id) ?? 0, clicks: clickMap.get(r.id) ?? 0 }));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/view')
  async trackView(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    if (user?.user_id) {
      // An advisory lock serializes concurrent calls for this exact
      // user+banner+view — INSERT ... WHERE NOT EXISTS alone isn't race-safe:
      // under READ COMMITTED, two near-simultaneous requests can both
      // evaluate "not exists" before either commits and both insert
      // (verified with parallel requests during testing), duplicating this
      // vendor's viewer list for one real view.
      const since = new Date(Date.now() - 3600000);
      await this.impressionRepo.manager.transaction(async (em) => {
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bi:${user.user_id}:${id}`]);
        await em.query(
          `INSERT INTO banner_impressions (banner_id, user_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM banner_impressions
             WHERE user_id = $2 AND banner_id = $1 AND created_at >= $3
           )`,
          [id, user.user_id, since],
        );
      });
      return { success: true };
    }

    const ip = (req as any).headers['x-forwarded-for']?.split(',')[0]?.trim() ?? (req as any).socket?.remoteAddress ?? 'unknown';
    const key = `${ip}:${id}`;
    const now = Date.now();
    const lastSeen = BannerAdsController.viewCache.get(key) ?? 0;
    if (now - lastSeen >= 3600000) {
      BannerAdsController.viewCache.set(key, now);
      if (BannerAdsController.viewCache.size > 50000) {
        for (const [k, t] of BannerAdsController.viewCache) {
          if (now - t >= 3600000) BannerAdsController.viewCache.delete(k);
        }
      }
      await this.impressionRepo.insert({ banner_id: id, user_id: null });
    }
    return { success: true };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/click')
  async trackClick(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    if (user?.user_id) {
      // Same advisory-lock dedupe as trackView above — avoids the same race.
      const since = new Date(Date.now() - 3600000);
      await this.clickRepo.manager.transaction(async (em) => {
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bc:${user.user_id}:${id}`]);
        await em.query(
          `INSERT INTO banner_clicks (banner_id, user_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM banner_clicks
             WHERE user_id = $2 AND banner_id = $1 AND created_at >= $3
           )`,
          [id, user.user_id, since],
        );
      });
      return { success: true };
    }

    const ip = (req as any).headers['x-forwarded-for']?.split(',')[0]?.trim() ?? (req as any).socket?.remoteAddress ?? 'unknown';
    const key = `${ip}:${id}`;
    const now = Date.now();
    const lastSeen = BannerAdsController.clickCache.get(key) ?? 0;
    if (now - lastSeen >= 3600000) {
      BannerAdsController.clickCache.set(key, now);
      if (BannerAdsController.clickCache.size > 50000) {
        for (const [k, t] of BannerAdsController.clickCache) {
          if (now - t >= 3600000) BannerAdsController.clickCache.delete(k);
        }
      }
      await this.clickRepo.insert({ banner_id: id, user_id: null });
    }
    return { success: true };
  }

  // Drill-down behind each view/click count — "who actually saw/tapped
  // this?" — modeled on AnalyticsService.audienceInteractions. Anonymous
  // rows (user_id null) are naturally dropped by the INNER JOIN, same as
  // that existing pattern.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Get(':id/viewers')
  async viewers(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type = 'view',
    @Query('page') page = '1',
  ) {
    if (!['view', 'click'].includes(type)) type = 'view';
    const banner = await this.bannerRepo.findOne({ where: { id }, select: ['id', 'vendor_id'] });
    if (!banner) throw new NotFoundException('Banner ad request not found');
    if (user.role !== 'admin') {
      const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
      if (!vendor || banner.vendor_id !== vendor.id) {
        throw new ForbiddenException("This banner belongs to another shop's ads");
      }
    }

    const limit = 20;
    const pageNum = Math.max(Number(page) || 1, 1);
    const offset = (pageNum - 1) * limit;
    const repo = type === 'click' ? this.clickRepo : this.impressionRepo;
    const alias = type === 'click' ? 'bc' : 'bi';
    const qb = repo.createQueryBuilder(alias)
      .innerJoin('users', 'u', `u.id = ${alias}.user_id`)
      .select([`${alias}.id AS id`, `${alias}.created_at AS created_at`, 'u.name AS user_name', 'u.avatar_url AS avatar_url'])
      .where(`${alias}.banner_id = :id`, { id })
      .orderBy(`${alias}.created_at`, 'DESC');

    const [rows, total] = await Promise.all([
      qb.clone().offset(offset).limit(limit).getRawMany(),
      qb.getCount(),
    ]);
    return { success: true, data: { rows, total, page: pageNum, limit } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin')
  async listAdmin() {
    const requests = await this.bannerRepo.find({ order: { created_at: 'DESC' } });

    const vendorIds = [...new Set(requests.map((r) => r.vendor_id))];
    const vendors = vendorIds.length
      ? await this.vendorRepo.find({ where: { id: In(vendorIds) }, select: ['id', 'business_name'] })
      : [];
    const vendorMap = new Map(vendors.map((v) => [v.id, v.business_name]));

    const withPlans = await this.attachPlanNames(requests);
    const data = withPlans.map((r) => ({ ...r, business_name: vendorMap.get(r.vendor_id) ?? 'Unknown' }));
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestBannerAdDto) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) return { success: false, error: 'Vendor not found' };

    // Plan-gating removed here — any vendor on any plan can request a
    // banner ad regardless of subscription tier; payment still applies.
    const plan = await this.bannerPlanRepo.findOne({ where: { id: dto.banner_plan_id, is_active: true } });
    if (!plan) return { success: false, error: 'Selected banner plan not found or inactive' };

    const banner = await this.bannerRepo.save({
      vendor_id: vendor.id,
      title: dto.title,
      image_url: dto.image_url,
      media_type: dto.media_type ?? 'image',
      target_url: dto.target_url,
      position: plan.position,
      duration_days: plan.duration_days,
      banner_plan_id: plan.id,
      price: plan.price,
      status: 'pending',
    });
    return { success: true, data: { id: banner.id, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/review')
  async review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewBannerAdDto) {
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');

    // Approval no longer makes the banner live — it unlocks payment.
    // expires_at is set only once the vendor pays (see confirmPayment).
    // Repository.update() is a bulk QueryBuilder update, not a save() on a
    // loaded entity — @UpdateDateColumn only auto-fires on save(), so it's
    // set explicitly here.
    const updateData: Partial<BannerAdRequest> = { status: dto.status, review_note: dto.note ?? null, updated_at: new Date() };
    await this.bannerRepo.update(id, updateData);

    const user = await this.notifyVendorUser(banner.vendor_id);
    if (user) {
      if (dto.status === 'approved') {
        await this.push.send(user.id, 'Banner Ad Approved', `Your banner "${banner.title}" was approved — complete payment to make it live.`, { type: 'banner_approved', route: '/vendor/banner-ads' });
        if (user.email && await this.notificationSettings.isEnabled('banner_approved', 'email')) {
          await this.mail.sendStatusEmail(
            user.email, user.name, 'Your banner ad was approved 🎉',
            `Your banner "<strong>${banner.title}</strong>" has been approved. Complete payment to make it live.`,
            // Was /vendor/banners — that route doesn't exist (App.tsx's real
            // path is /vendor/banner-ads), so this link 404'd.
            'Complete Payment', `${process.env.APP_URL || 'https://adslife.in'}/vendor/banner-ads`,
          );
        }
      } else {
        await this.push.send(user.id, 'Banner Ad Update', dto.note || `Your banner "${banner.title}" was not approved.`, { type: 'banner_rejected', route: '/vendor/banner-ads' });
        if (user.email && await this.notificationSettings.isEnabled('banner_rejected', 'email')) {
          await this.mail.sendStatusEmail(
            user.email, user.name, 'Update on your banner ad request',
            dto.note || `Your banner "<strong>${banner.title}</strong>" was not approved this time.`,
          );
        }
      }
    }

    return { success: true, data: { updated: true } };
  }

  // ── Payment: vendor pays for an approved banner, then it goes live ──────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post(':id/pay')
  async pay(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');
    if (!vendor || banner.vendor_id !== vendor.id) {
      return { success: false, error: 'This banner belongs to another vendor' };
    }
    if (banner.status !== 'approved') {
      return { success: false, error: 'Only approved banner requests can be paid for' };
    }
    const plan = banner.banner_plan_id
      ? await this.bannerPlanRepo.findOne({ where: { id: banner.banner_plan_id } })
      : null;
    const amount = Number(plan?.price ?? banner.price ?? 0);
    if (amount < 1) return { success: false, error: 'Invalid banner plan price' };

    const order = await this.cashfreeService.createOrder(
      user.user_id, amount, 'INR', `banner_${banner.id}_${Date.now()}`,
      { name: user.name, email: user.email, phone: user.phone },
    );
    await this.bannerRepo.update(id, {
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
      updated_at: new Date(),
    });
    // Previously never written at all — banner payments settled with
    // Cashfree and made the banner live, but with no row in `payments`,
    // they could never show up in the vendor's Payments tab (payment.
    // service.ts's myList() just reads WHERE user_id = :userId from this
    // same table — it was always ready for this, nothing ever fed it).
    await this.paymentRepo.save({
      user_id: user.user_id,
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
      amount,
      purpose: 'banner_ad',
      reference_id: banner.id,
      reference_type: 'banner_ad',
    });
    return { success: true, data: order };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post(':id/confirm-payment')
  async confirmPayment(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { order_id: string },
  ) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');
    if (!vendor || banner.vendor_id !== vendor.id) {
      return { success: false, error: 'This banner belongs to another vendor' };
    }
    // Idempotency guard: Cashfree reports a paid order as PAID forever, so
    // without this a vendor could replay this same call indefinitely and
    // reset expires_at = now + duration_days every time — an unlimited free
    // extension off one payment. PaymentService.confirmPayment already
    // guards the same way for subscription payments; this endpoint didn't.
    if (banner.status === 'live' && banner.paid_at) {
      return { success: true, data: { status: 'live', expires_at: banner.expires_at } };
    }
    // Independently re-checks the order status with Cashfree — no client
    // signature to trust here, unlike the old Razorpay HMAC verify.
    const { orderStatus, cfPaymentId } = await this.cashfreeService.getOrderStatus(body.order_id);
    if (orderStatus !== 'PAID' || banner.order_id !== body.order_id) {
      return { success: false, error: 'Payment not completed' };
    }

    const now = new Date();
    const expires = new Date(now.getTime() + (banner.duration_days ?? 7) * 86400000);
    await this.bannerRepo.update(id, {
      status: 'live',
      starts_at: now,
      expires_at: expires,
      paid_at: now,
      updated_at: now,
    });
    await this.paymentRepo.update(
      { order_id: body.order_id },
      { status: PaymentStatus.PAID, cashfree_payment_id: cfPaymentId, paid_at: now },
    );

    const notifyUser = await this.notifyVendorUser(banner.vendor_id);
    if (notifyUser) {
      await this.push.send(notifyUser.id, 'Banner Ad Live!', `Your banner "${banner.title}" is now live on AdsLife.`, { type: 'banner_live', route: '/vendor/banner-ads' });
      if (notifyUser.email && await this.notificationSettings.isEnabled('banner_live', 'email')) {
        await this.mail.sendStatusEmail(
          notifyUser.email, notifyUser.name, 'Your banner ad is now live 🚀',
          `Your banner "<strong>${banner.title}</strong>" is now live and showing to AdsLife users until ${expires.toDateString()}.`,
        );
      }
    }

    return { success: true, data: { status: 'live', expires_at: expires } };
  }

  // ── Vendor/admin deletes a banner request ──────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');

    // Admins may delete any request; vendors only their own.
    if (user.role !== 'admin') {
      const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
      if (!vendor || banner.vendor_id !== vendor.id) {
        return { success: false, error: 'This banner belongs to another vendor' };
      }
    }

    await this.bannerRepo.delete(id);
    return { success: true, data: { deleted: true } };
  }

  private async attachPlanNames(requests: BannerAdRequest[]) {
    const planIds = [...new Set(requests.map((r) => r.banner_plan_id).filter((id): id is number => id != null))];
    const plans = planIds.length ? await this.bannerPlanRepo.find({ where: { id: In(planIds) } }) : [];
    const planMap = new Map(plans.map((p) => [p.id, p.name]));
    return requests.map((r) => ({
      ...r,
      plan_name: r.banner_plan_id != null ? planMap.get(r.banner_plan_id) ?? null : null,
    }));
  }
}
