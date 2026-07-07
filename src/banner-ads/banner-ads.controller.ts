import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { BannerAdRequest } from '../entities/banner-ad-request.entity';
import { BannerPlan } from '../entities/banner-plan.entity';
import { Vendor } from '../entities/vendor.entity';
import { RequestBannerAdDto, ReviewBannerAdDto } from './dto/banner-ads.dto';
import { RazorpayService } from '../razorpay/razorpay.service';

@ApiTags('banner-ads')
@Controller('banner-ads')
export class BannerAdsController {
  constructor(
    @InjectRepository(BannerAdRequest) private readonly bannerRepo: Repository<BannerAdRequest>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(BannerPlan) private readonly bannerPlanRepo: Repository<BannerPlan>,
    private readonly razorpayService: RazorpayService,
  ) {}

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
    const data = await this.attachPlanNames(requests);
    return { success: true, data };
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
    const updateData: Partial<BannerAdRequest> = { status: dto.status, review_note: dto.note ?? null };
    await this.bannerRepo.update(id, updateData);
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
    const amount = Math.round(Number(plan?.price ?? banner.price ?? 0) * 100);
    if (amount < 100) return { success: false, error: 'Invalid banner plan price' };

    const order = await this.razorpayService.createOrder(
      user.user_id, amount, 'INR', `banner_${banner.id}`,
    );
    await this.bannerRepo.update(id, { razorpay_order_id: order.order_id });
    return { success: true, data: order };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('vendor', 'admin')
  @Post(':id/confirm-payment')
  async confirmPayment(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) {
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    const banner = await this.bannerRepo.findOne({ where: { id } });
    if (!banner) throw new NotFoundException('Banner ad request not found');
    if (!vendor || banner.vendor_id !== vendor.id) {
      return { success: false, error: 'This banner belongs to another vendor' };
    }
    // Verifies the HMAC signature; throws if it doesn't match
    await this.razorpayService.verifyPayment(
      body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature,
    );

    const now = new Date();
    const expires = new Date(now.getTime() + (banner.duration_days ?? 7) * 86400000);
    await this.bannerRepo.update(id, {
      status: 'live',
      starts_at: now,
      expires_at: expires,
      paid_at: now,
    });
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
