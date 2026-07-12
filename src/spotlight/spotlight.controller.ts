import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SpotlightRequest } from '../entities/spotlight-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { RequestSpotlightDto, ApproveSpotlightDto } from './dto/spotlight.dto';
import { PushService } from '../services/push.service';
import { MailService } from '../mail/mail.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

@ApiTags('spotlight')
@Controller('spotlight')
export class SpotlightController {
  constructor(
    @InjectRepository(SpotlightRequest) private readonly spotlightRepo: Repository<SpotlightRequest>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly notificationSettings: NotificationSettingsService,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  @Public()
  @Get('active')
  async active() {
    const data = await this.spotlightRepo
      .createQueryBuilder('sr')
      .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
      .select(['sr', 'v.business_name', 'v.logo_url', 'v.category'])
      .where("sr.status = 'approved'")
      .andWhere('sr.starts_at <= NOW()')
      .andWhere('(sr.ends_at IS NULL OR sr.ends_at > NOW())')
      .orderBy('sr.created_at', 'DESC')
      .getRawMany();
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('list')
  async list(@CurrentUser() user: any, @Query('status') status = '') {
    const isAdmin = user.role === 'admin';
    let rows: any[];

    // getRawMany() prefixes bare-entity selections (sr_id, sr_created_at…) —
    // alias every column explicitly so clients get stable names.
    const srCols = [
      'sr.id AS id', 'sr.vendor_id AS vendor_id', 'sr.offer_id AS offer_id',
      'sr.message AS message', 'sr.duration_days AS duration_days',
      'sr.status AS status', 'sr.starts_at AS starts_at',
      'sr.ends_at AS ends_at', 'sr.created_at AS created_at',
    ];
    if (isAdmin) {
      const qb = this.spotlightRepo
        .createQueryBuilder('sr')
        .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
        .innerJoin(User, 'u', 'v.user_id = u.id')
        .select([
          ...srCols,
          'v.business_name AS business_name', 'v.city AS city',
          'u.email AS vendor_email', 'v.subscription_plan AS subscription_plan',
        ])
        .orderBy('sr.created_at', 'DESC');
      if (status) qb.where('sr.status = :status', { status });
      rows = await qb.getRawMany();
    } else {
      rows = await this.spotlightRepo
        .createQueryBuilder('sr')
        .innerJoin(Vendor, 'v', 'sr.vendor_id = v.id')
        .select(srCols)
        .where('v.user_id = :userId', { userId: user.user_id })
        .orderBy('sr.created_at', 'DESC')
        .getRawMany();
    }

    return { success: true, data: { requests: rows, total: rows.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post('request')
  async request(@CurrentUser() user: any, @Body() dto: RequestSpotlightDto) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) return { success: false, error: 'Vendor not found' };

    if (user.role !== 'admin' && !(await this.planFeatures.vendorHasFeature(vendor.id, 'spotlight'))) {
      return { success: false, error: 'Spotlight isn\'t included in your current plan. Upgrade to unlock it.', code: 'PLAN_FEATURE_LOCKED' };
    }

    // "Free Promotion: 1/Month" (Pro tier) — spotlight itself has always
    // been a free (unpaid), plan-gated action; this adds the monthly pacing
    // the plan table promises to every vendor with 'spotlight' access,
    // reusing spotlight_requests directly rather than a separate credit
    // ledger or a second feature flag (only Pro has 'spotlight' today, so
    // this quota applies exactly where the table says it should — revisit
    // if a future plan gets 'spotlight' without the monthly cap). A
    // rejected request doesn't burn the vendor's monthly allowance.
    if (user.role !== 'admin') {
      // The count-check and the insert must happen inside the SAME locked
      // transaction — checking the quota in one transaction and inserting
      // in a separate call afterward still races: a second request could
      // acquire the lock and re-check the count in the gap between the
      // first request's count-check and its (unlocked) insert, so both
      // would see "quota available" and a vendor could claim 2+ free
      // spotlights inside the 30-day window the plan promises only 1 for.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const spotlight = await this.spotlightRepo.manager.transaction(async (em) => {
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`spotlight:${vendor.id}`]);
        const usedThisMonth = await em
          .createQueryBuilder(SpotlightRequest, 'sr')
          .where('sr.vendor_id = :vendorId', { vendorId: vendor.id })
          .andWhere('sr.status != :rejected', { rejected: 'rejected' })
          .andWhere('sr.created_at >= :since', { since: thirtyDaysAgo })
          .getCount();
        if (usedThisMonth > 0) return null;
        return em.getRepository(SpotlightRequest).save({
          vendor_id: vendor.id,
          offer_id: dto.offer_id ?? null,
          message: dto.message ?? null,
          duration_days: dto.duration_days ?? 7,
          status: 'pending',
        });
      });
      if (!spotlight) {
        return { success: false, error: "You've already used this month's free promotion. Your next one unlocks 30 days after your last request.", code: 'PROMOTION_QUOTA_USED' };
      }
      return { success: true, data: { id: spotlight.id, status: 'pending' } };
    }

    const spotlight = await this.spotlightRepo.save({
      vendor_id: vendor.id,
      offer_id: dto.offer_id ?? null,
      message: dto.message ?? null,
      duration_days: dto.duration_days ?? 7,
      status: 'pending',
    });
    return { success: true, data: { id: spotlight.id, status: 'pending' } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveSpotlightDto) {
    const spotlight = await this.spotlightRepo.findOne({ where: { id } });
    if (!spotlight) throw new NotFoundException('Spotlight request not found');

    // Repository.update() is a bulk QueryBuilder update, not a save() on a
    // loaded entity — @UpdateDateColumn only auto-fires on save(), so it's
    // set explicitly here.
    const updateData: Partial<SpotlightRequest> = { status: dto.status, updated_at: new Date() };
    if (dto.status === 'approved') {
      const days = dto.duration_days ?? 7;
      const now = new Date();
      const ends = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      updateData.starts_at = now;
      updateData.ends_at = ends;
    }
    await this.spotlightRepo.update(id, updateData);

    const vendor = await this.vendorRepo.findOne({ where: { id: spotlight.vendor_id }, select: ['user_id', 'business_name'] });
    const user = vendor ? await this.userRepo.findOne({ where: { id: vendor.user_id }, select: ['id', 'name', 'email'] }) : null;
    if (user) {
      if (dto.status === 'approved') {
        await this.push.send(user.id, 'Spotlight Approved!', `Your spotlight request for ${vendor?.business_name ?? 'your business'} was approved.`, { type: 'spotlight_approved', route: '/vendor/offers' });
        if (user.email && await this.notificationSettings.isEnabled('spotlight_approved', 'email')) {
          await this.mail.sendStatusEmail(
            user.email, user.name, 'Your spotlight request was approved 🎉',
            `Your spotlight request has been approved and will run for ${updateData.ends_at ? Math.round((updateData.ends_at.getTime() - Date.now()) / 86400000) : dto.duration_days ?? 7} days.`,
          );
        }
      } else {
        await this.push.send(user.id, 'Spotlight Update', 'Your spotlight request was not approved this time.', { type: 'spotlight_rejected', route: '/vendor/offers' });
        if (user.email && await this.notificationSettings.isEnabled('spotlight_rejected', 'email')) {
          await this.mail.sendStatusEmail(
            user.email, user.name, 'Update on your spotlight request',
            'Your spotlight request was not approved this time. You\'re welcome to submit a new request anytime.',
          );
        }
      }
    }

    return { success: true, data: { updated: true } };
  }
}
