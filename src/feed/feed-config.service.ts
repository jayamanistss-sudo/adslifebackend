import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../entities/site-setting.entity';

// Every one of these ~15 constants previously lived hardcoded in
// feed.service.ts, requiring a full deploy to adjust the one algorithm that
// determines what every single user sees first — the audit's single most
// consequential "missing control" finding. Defaults below match the exact
// pre-existing behavior so shipping this is a zero-behavior-change deploy;
// only an explicit admin edit changes anything.
export interface FeedWeights {
  distance_tier1: number;   // <=1km
  distance_tier2: number;   // <=5km
  distance_tier3: number;   // <=10km
  distance_tier4: number;   // <=20km
  distance_tier5: number;   // >20km
  distance_no_location: number; // no user location, or vendor missing coords
  category_preferred: number;
  category_has: number;
  vendor_preferred: number;
  recency_1day: number;
  recency_3day: number;
  recency_7day: number;
  recency_default: number;
  discount_max_weight: number; // multiplier applied to discount_percent/100
  featured_bonus: number;
  trending_view_weight: number;
  trending_click_weight: number;
  trending_save_weight: number;
  filter_flash_min_discount: number;
  filter_trending_min_views: number;
  filter_ending_soon_days: number;
  // Search-ranking-by-plan-tier — new for the 3-tier plan overhaul (Starter
  // = Normal, Growth = Higher, Pro = Highest). Modest values in the same
  // scale as featured_bonus; admin-tunable from here on.
  plan_tier_starter: number;
  plan_tier_growth: number;
  plan_tier_pro: number;
}

export const DEFAULT_FEED_WEIGHTS: FeedWeights = {
  distance_tier1: 0.25,
  distance_tier2: 0.20,
  distance_tier3: 0.125,
  distance_tier4: 0.075,
  distance_tier5: 0.025,
  distance_no_location: 0.20,
  category_preferred: 0.35,
  category_has: 0.105,
  vendor_preferred: 0.10,
  recency_1day: 0.10,
  recency_3day: 0.07,
  recency_7day: 0.04,
  recency_default: 0.01,
  discount_max_weight: 0.20,
  featured_bonus: 0.05,
  trending_view_weight: 1,
  trending_click_weight: 2,
  trending_save_weight: 3,
  filter_flash_min_discount: 30,
  filter_trending_min_views: 100,
  filter_ending_soon_days: 2,
  plan_tier_starter: 0,
  plan_tier_growth: 0.03,
  plan_tier_pro: 0.08,
};

const SETTING_KEY = 'feed_weights';

@Injectable()
export class FeedConfigService {
  // Read once per request, not per offer scored — matches the same 30s TTL
  // cache pattern already used for notification settings.
  private cache: FeedWeights | null = null;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  async getWeights(): Promise<FeedWeights> {
    if (this.cache && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return this.cache;
    const row = await this.settingRepo.findOne({ where: { key: SETTING_KEY } });
    let stored: Partial<FeedWeights> = {};
    if (row?.value) {
      try { stored = JSON.parse(row.value); } catch { stored = {}; }
    }
    this.cache = { ...DEFAULT_FEED_WEIGHTS, ...stored };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  async setWeights(patch: Partial<FeedWeights>): Promise<FeedWeights> {
    // These weights are string-interpolated directly into raw SQL CASE
    // expressions in feed.service.ts on every public feed request — reject
    // anything that isn't a small finite number before it ever reaches the
    // query builder. Mirrors the same guard already applied to the sibling
    // leaderboard-config.service.ts's setWeights, which this endpoint had
    // been missed by (the request body here is a plain Record<string,number>
    // type alias, not a validated DTO class, so Nest's ValidationPipe never
    // touches it).
    for (const [key, val] of Object.entries(patch)) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < -1000 || val > 100000) {
        throw new BadRequestException(`${key} must be a finite number between -1000 and 100000`);
      }
    }
    const current = await this.getWeights();
    const merged = { ...current, ...patch };
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(merged) }, ['key']);
    this.cache = merged;
    this.cacheLoadedAt = Date.now();
    return merged;
  }

  async resetToDefaults(): Promise<FeedWeights> {
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(DEFAULT_FEED_WEIGHTS) }, ['key']);
    this.cache = { ...DEFAULT_FEED_WEIGHTS };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }
}
