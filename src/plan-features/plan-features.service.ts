import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Vendor } from '../entities/vendor.entity';

// Canonical, code-checked feature keys — separate from the free-text
// `features` marketing bullets, which nothing ever reads. Add new gated
// features here as they're built.
export const PLAN_FEATURE_KEYS = [
  // banner_ads removed as a gate — any vendor on any plan can request a
  // banner ad now (payment still applies); kept out of this list entirely
  // since a dead flag here would still show as a togglable admin control.
  'spotlight',
  'ai_generation', 'verified_badge', 'verified_badge_premium',
  'analytics_saves_clicks', 'analytics_full',
  // Granular per-metric controls — count (the raw number) and details (the
  // who/when drill-down) are deliberately separate keys so a plan can grant
  // one without the other, replacing the old all-or-nothing bundling under
  // analytics_saves_clicks for these specific metrics.
  'view_count', 'view_details',
  'click_count', 'click_details',
  'save_count', 'save_details',
  'redeemed_count', 'redeemed_details',
  'review_access',
  'subscriber_count', 'subscriber_details',
  'analytics_views_graph', 'analytics_city_graph',
  'offer_mail_notification', 'monthly_report_auto_send',
] as const;
export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

@Injectable()
export class PlanFeaturesService {
  private cache = new Map<string, string[]>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
  ) {}

  private async ensureCache(): Promise<void> {
    if (Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return;
    const plans = await this.planRepo.find({ select: ['slug', 'feature_flags'] });
    this.cache = new Map(plans.map((p) => [p.slug, p.feature_flags ?? []]));
    this.cacheLoadedAt = Date.now();
  }

  invalidateCache(): void {
    this.cacheLoadedAt = 0;
  }

  /** Fail-closed: an unknown plan slug or a plan with no flags set grants nothing. */
  async planHasFeature(planSlug: string, key: PlanFeatureKey): Promise<boolean> {
    await this.ensureCache();
    return (this.cache.get(planSlug) ?? []).includes(key);
  }

  async vendorHasFeature(vendorId: number, key: PlanFeatureKey): Promise<boolean> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId }, select: ['subscription_plan'] });
    return this.planHasFeature(vendor?.subscription_plan ?? 'starter', key);
  }

  /** 'premium' beats 'standard' beats 'none' — driven by feature_flags, not a hardcoded slug check, so an admin toggling the checkboxes in AdminSubscriptions actually changes what renders. */
  async badgeTierForPlan(planSlug: string): Promise<'premium' | 'standard' | 'none'> {
    await this.ensureCache();
    const flags = this.cache.get(planSlug) ?? [];
    if (flags.includes('verified_badge_premium')) return 'premium';
    if (flags.includes('verified_badge')) return 'standard';
    return 'none';
  }
}
