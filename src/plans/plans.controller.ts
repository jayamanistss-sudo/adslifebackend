import {
  Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Vendor } from '../entities/vendor.entity';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

// Default set — lets an empty plans table (first setup, or after a data
// reset) be repopulated with one admin-panel click instead of a manual SQL
// insert. Matches the current live pricing.
const DEFAULT_PLANS = [
  {
    name: 'Starter', slug: 'starter', price: 0, annual_price: null, duration_days: 30, max_offers: 10,
    features: ['List up to 10 offers/month', 'Basic business listing', 'Views analytics', 'Basic support'],
    feature_flags: [
      'view_count', 'review_access', 'subscriber_count', 'analytics_views_graph',
    ],
  },
  {
    name: 'Growth', slug: 'growth', price: 199, annual_price: 1990, duration_days: 30, max_offers: 15,
    features: ['List up to 15 offers/month', 'Views, saves & clicks analytics', 'Verified badge', 'Higher search ranking', 'Priority support'],
    feature_flags: [
      'analytics_saves_clicks', 'verified_badge',
      'view_count', 'view_details', 'click_count', 'click_details',
      'save_count', 'save_details', 'redeemed_count', 'review_access',
      'subscriber_count', 'subscriber_details', 'analytics_views_graph',
      'offer_mail_notification',
    ],
  },
  {
    name: 'Pro', slug: 'pro', price: 599, annual_price: 5990, duration_days: 30, max_offers: null,
    features: ['Unlimited offers', 'Full analytics — views, saves, clicks & customer engagement', 'AI-powered offer generation', 'Premium verified badge', 'Highest search ranking', '1 free promotion per month', 'Premium support'],
    feature_flags: [
      'spotlight', 'analytics_saves_clicks', 'analytics_full',
      'verified_badge_premium', 'ai_generation',
      'view_count', 'view_details', 'click_count', 'click_details',
      'save_count', 'save_details', 'redeemed_count', 'redeemed_details',
      'review_access', 'subscriber_count', 'subscriber_details',
      'analytics_views_graph', 'analytics_city_graph',
      'offer_mail_notification', 'monthly_report_auto_send',
    ],
  },
];

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@CurrentUser() user: any) {
    const isAdmin = user?.role === 'admin';
    const data = await this.planRepo.find({
      where: isAdmin ? {} : { is_active: true },
      order: { price: 'ASC' },
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    const plan = await this.planRepo.save({
      name: dto.name,
      slug: dto.slug,
      price: dto.price ?? 0,
      duration_days: dto.duration_days ?? 30,
      annual_price: dto.annual_price ?? null,
      max_offers: dto.max_offers ?? null,
      features: dto.features ?? [],
      feature_flags: dto.feature_flags ?? [],
      is_active: true,
    });
    return { success: true, data: { id: plan.id } };
  }

  // Safe to call repeatedly — no-ops if any plans already exist, so this
  // can't duplicate or overwrite live pricing, only repopulate an empty table.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post('seed')
  async seed() {
    const existing = await this.planRepo.count();
    if (existing > 0) return { success: true, data: { inserted: 0, skipped: true } };
    await this.planRepo.insert(DEFAULT_PLANS.map((p) => ({ ...p, is_active: true })));
    this.planFeatures.invalidateCache();
    return { success: true, data: { inserted: DEFAULT_PLANS.length } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlanDto) {
    const updateData: Partial<SubscriptionPlan> = {};
    if (dto.name       !== undefined) updateData.name          = dto.name;
    if (dto.slug       !== undefined) updateData.slug          = dto.slug;
    if (dto.price      !== undefined) updateData.price         = dto.price as any;
    if (dto.duration_days !== undefined) updateData.duration_days = dto.duration_days;
    if (dto.annual_price !== undefined) updateData.annual_price = dto.annual_price as any;
    if (dto.max_offers !== undefined) updateData.max_offers    = dto.max_offers;
    if (dto.features   !== undefined) updateData.features      = dto.features;
    if (dto.feature_flags !== undefined) updateData.feature_flags = dto.feature_flags;
    if (dto.is_active  !== undefined) updateData.is_active     = dto.is_active === 1;

    if (!Object.keys(updateData).length) return { success: false, error: 'Nothing to update' };
    await this.planRepo.update(id, updateData);
    this.planFeatures.invalidateCache();
    return { success: true, data: { updated: true } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) return { success: false, error: 'Plan not found' };

    const inUse = await this.vendorRepo.count({ where: { subscription_plan: plan.slug } });
    if (inUse > 0) {
      return {
        success: false,
        error: `${inUse} vendor${inUse === 1 ? ' is' : 's are'} currently on this plan — deactivate it instead of deleting`,
      };
    }

    await this.planRepo.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
