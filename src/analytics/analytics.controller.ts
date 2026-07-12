import {
  Controller, Get, Query, UseGuards,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Vendor } from '../entities/vendor.entity';
import { RoiQueryDto, AudienceQueryDto, HeatmapQueryDto, BenchmarkQueryDto } from './dto/analytics.dto';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('vendor', 'admin')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  // Just resolves + authenticates the caller's vendor id — no feature check
  // here. ROI/heatmap/benchmark apply their own single-flag gate below
  // (unchanged); audience/audience-interactions apply granular per-metric
  // gates instead, since they cover a mix of soft-lockable aggregate counts
  // and hard-gated PII drill-downs.
  private async resolveVendorId(user: any, queryVendorId?: number): Promise<number> {
    if (user.role === 'admin') {
      if (!queryVendorId) throw new BadRequestException('Admin must provide vendor_id query param');
      return queryVendorId;
    }
    const vendor = await this.vendorRepo.findOne({ where: { user_id: user.user_id }, select: ['id'] });
    if (!vendor) throw new ForbiddenException('Vendor profile not found');
    return vendor.id;
  }

  private async requireFeature(vendorId: number, key: 'analytics_saves_clicks' | 'analytics_full') {
    if (!(await this.planFeatures.vendorHasFeature(vendorId, key))) {
      throw new ForbiddenException("This analytics view isn't included in your current plan. Upgrade to unlock it.");
    }
  }

  @Get('roi')
  async roi(@CurrentUser() user: any, @Query() query: RoiQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    await this.requireFeature(vendorId, 'analytics_saves_clicks');
    const data = await this.analyticsService.roi(query.offer_id, query.days ?? 30, vendorId, user.role);
    return { success: true, data };
  }

  // Always returns real aggregate numbers — `locked` tells the frontend
  // which cards to render blurred with an upgrade CTA (soft tease, no PII).
  // top_cities is the one exception with actual per-user city data mixed
  // in aggregate form; still gated softly since it's a city name, not an
  // identity — the hard PII gate lives in audienceInteractions() below.
  @Get('audience')
  async audience(@CurrentUser() user: any, @Query() query: AudienceQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    const data = await this.analyticsService.audience(vendorId, query.days ?? 30);
    const [viewCount, clickCount, saveCount, redeemedCount, subscriberCount, cityGraph] = await Promise.all([
      this.planFeatures.vendorHasFeature(vendorId, 'view_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'click_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'save_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'redeemed_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'subscriber_count'),
      this.planFeatures.vendorHasFeature(vendorId, 'analytics_city_graph'),
    ]);
    return {
      success: true,
      data: {
        ...data,
        top_cities: cityGraph ? data.top_cities : [],
        locked: {
          view_count: !viewCount, click_count: !clickCount, save_count: !saveCount,
          redeemed_count: !redeemedCount, subscriber_count: !subscriberCount,
          analytics_city_graph: !cityGraph,
        },
      },
    };
  }

  @Get('heatmap')
  async heatmap(@CurrentUser() user: any, @Query() query: HeatmapQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    await this.requireFeature(vendorId, 'analytics_saves_clicks');
    const data = await this.analyticsService.heatmap(vendorId, query.days ?? 30);
    return { success: true, data };
  }

  @Get('benchmark')
  async benchmark(@CurrentUser() user: any, @Query() query: BenchmarkQueryDto) {
    const vendorId = await this.resolveVendorId(user, query.vendor_id);
    await this.requireFeature(vendorId, 'analytics_full');
    const data = await this.analyticsService.benchmark(vendorId);
    return { success: true, data };
  }

  // Per-action PII drill-down (who/when) — hard-gated per action's own
  // _details flag, unlike the soft-locked counts above, since this is real
  // customer identity data, not just an aggregate number.
  @Get('audience/interactions')
  async audienceInteractions(
    @CurrentUser() user: any,
    @Query('action') action: string,
    @Query('vendor_id') vendorId?: number,
    @Query('page') page?: string,
  ) {
    const resolvedVendorId = await this.resolveVendorId(user, vendorId);
    if (!['view', 'click', 'save', 'redeem'].includes(action)) {
      throw new BadRequestException('Invalid action type');
    }
    const detailFlag = { view: 'view_details', click: 'click_details', save: 'save_details', redeem: 'redeemed_details' }[action] as
      'view_details' | 'click_details' | 'save_details' | 'redeemed_details';
    if (!(await this.planFeatures.vendorHasFeature(resolvedVendorId, detailFlag))) {
      return { success: false, error: "This detail view isn't included in your current plan. Upgrade to unlock it.", code: 'PLAN_FEATURE_LOCKED' };
    }
    const data = await this.analyticsService.audienceInteractions(resolvedVendorId, action, page ? +page : 1);
    return { success: true, data };
  }
}
