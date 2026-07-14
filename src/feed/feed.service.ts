import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Offer } from '../entities/offer.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { SavedOffer } from '../entities/saved-offer.entity';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { Vendor } from '../entities/vendor.entity';
import { clampLimit } from '../common/utils/pagination';
import { FeedConfigService, FeedWeights } from './feed-config.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(UserPreference) private readonly userPrefRepo: Repository<UserPreference>,
    @InjectRepository(SavedOffer) private readonly savedOfferRepo: Repository<SavedOffer>,
    @InjectRepository(UserInteraction) private readonly userInteractionRepo: Repository<UserInteraction>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly feedConfig: FeedConfigService,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  // Small distinct-slug set per page (at most a handful of plans exist), so
  // this is cheap even though badgeTierForPlan() is technically async.
  private async attachBadgeTiers<T extends { subscription_plan?: string | null }>(rows: T[]): Promise<(T & { vendor_badge_tier: string })[]> {
    const slugs = [...new Set(rows.map((r) => r.subscription_plan).filter((s): s is string => !!s))];
    const tiers = new Map(await Promise.all(slugs.map(async (s) => [s, await this.planFeatures.badgeTierForPlan(s)] as const)));
    return rows.map((r) => ({ ...r, vendor_badge_tier: (r.subscription_plan && tiers.get(r.subscription_plan)) || 'none' }));
  }

  // Fields a free-text search matches against: offer name, description,
  // category, coupon code, vendor name, vendor category, and location
  // (city + address). Case-insensitive.
  private static readonly SEARCH_FIELDS = [
    'o.title', 'o.description', 'o.category', 'o.coupon_code',
    'v.business_name', 'v.category', 'v.city', 'v.address',
  ];

  // Build an AND-of-ORs clause: every whitespace-separated term must match at
  // least one field, so "biryani chennai" matches a Chennai biryani offer.
  // Returns null when the query is empty. Param names are stable so the same
  // clause can be applied to both the data and the count query builders.
  private buildSearchClause(search: string): { clause: string; params: Record<string, string> } | null {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    if (!terms.length) return null;
    const params: Record<string, string> = {};
    const clause = terms
      .map((term, i) => {
        const key = `q${i}`;
        params[key] = `%${term}%`;
        return '(' + FeedService.SEARCH_FIELDS.map((f) => `${f} ILIKE :${key}`).join(' OR ') + ')';
      })
      .join(' AND ');
    return { clause, params };
  }

  // Server-side feed filters (category / distance / quick-filter) applied to
  // both the data and count query builders. `distExpr` is the SQL haversine
  // distance expression already built for the current lat/lng ('NULL' if none).
  private applyFeedFilters(
    qb: SelectQueryBuilder<any>,
    opts: { category?: string; distanceKm?: number; filter?: string; distExpr: string },
    w: FeedWeights,
  ) {
    if (opts.category) {
      qb.andWhere('o.category = :fcat', { fcat: opts.category });
    }
    if (opts.distanceKm && opts.distExpr !== 'NULL') {
      qb.andWhere(`${opts.distExpr} <= :fradius`, { fradius: opts.distanceKm });
    }
    switch (opts.filter) {
      case 'flash':
        qb.andWhere('COALESCE(o.discount_percent, 0) >= :flashMin', { flashMin: w.filter_flash_min_discount });
        break;
      case 'trending':
        qb.andWhere('o.views > :trendingMin', { trendingMin: w.filter_trending_min_views });
        break;
      case 'ending':
        qb.andWhere(`o.valid_until IS NOT NULL AND o.valid_until <= NOW() + make_interval(days => :endingDays)`, { endingDays: w.filter_ending_soon_days });
        break;
      default:
        break; // 'all' / undefined → no extra constraint
    }
  }

  async totalActiveOffers(): Promise<number> {
    return this.offerRepo
      .createQueryBuilder('o')
      .innerJoin('vendors', 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'")
      .getCount();
  }

  async personalized(
    userId: number, lat: number, lng: number, page: number, perPage = 20, search = '',
    category = '', distanceKm = 0, filter = '', sort = '',
  ) {
    const limit = clampLimit(perPage, 20, 500);
    const offset = (Math.max(page, 1) - 1) * limit;
    const w = await this.feedConfig.getWeights();

    const prefs = await this.userPrefRepo.findOne({ where: { user_id: userId } });
    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const preferredCategories: string[] = safeJson(prefs?.preferred_categories);
    // Sanitize to positive integers to prevent SQL injection in the raw IN() clause
    const preferredVendors: number[] = safeJson(prefs?.preferred_vendors)
      .map(Number).filter((n: number) => Number.isInteger(n) && n > 0);

    // lat/lng are ParseFloatPipe-validated numbers, but bind them as query
    // parameters anyway so this expression can never become an injection point.
    const distExpr = Number.isFinite(lat) && Number.isFinite(lng)
      ? `(6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(:ulat)) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(:ulng)) +
           SIN(RADIANS(:ulat)) * SIN(RADIANS(v.lat))
         ))))`
      : 'NULL';

    const distScore = Number.isFinite(lat) && Number.isFinite(lng)
      ? `CASE
           WHEN v.lat IS NULL OR v.lng IS NULL THEN ${w.distance_no_location}
           WHEN ${distExpr} <= 1  THEN ${w.distance_tier1}
           WHEN ${distExpr} <= 5  THEN ${w.distance_tier2}
           WHEN ${distExpr} <= 10 THEN ${w.distance_tier3}
           WHEN ${distExpr} <= 20 THEN ${w.distance_tier4}
           ELSE ${w.distance_tier5}
         END`
      : `${w.distance_no_location}`;

    const catScore = preferredCategories.length
      ? `CASE WHEN o.category IN (${preferredCategories.map(c => `'${c.replace(/'/g, "''")}'`).join(',')}) THEN ${w.category_preferred} WHEN o.category IS NOT NULL THEN ${w.category_has} ELSE 0 END`
      : `CASE WHEN o.category IS NOT NULL THEN ${w.category_has} ELSE 0 END`;

    const vendorScore = preferredVendors.length
      ? `CASE WHEN o.vendor_id IN (${preferredVendors.join(',')}) THEN ${w.vendor_preferred} ELSE 0 END`
      : '0';

    const recencyScore = `CASE
      WHEN o.created_at >= NOW() - INTERVAL '1 day'  THEN ${w.recency_1day}
      WHEN o.created_at >= NOW() - INTERVAL '3 days' THEN ${w.recency_3day}
      WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN ${w.recency_7day}
      ELSE ${w.recency_default}
    END`;

    const discountScore = `LEAST(COALESCE(o.discount_percent, 0) / 100, 1.0) * ${w.discount_max_weight}`;
    // Now respects the featured curation window (start/end) added alongside
    // the new admin Featured Offers page — previously a flat boolean bonus
    // regardless of when it was flagged featured.
    const featuredBonus = `CASE WHEN o.is_featured
      AND (o.featured_start_at IS NULL OR o.featured_start_at <= NOW())
      AND (o.featured_until IS NULL OR o.featured_until >= NOW())
      THEN ${w.featured_bonus} ELSE 0 END`;

    // Search-ranking-by-plan-tier, part of the 3-tier plan overhaul (Starter
    // = Normal, Growth = Higher, Pro = Highest).
    const planTierScore = `CASE v.subscription_plan
      WHEN 'pro' THEN ${w.plan_tier_pro}
      WHEN 'growth' THEN ${w.plan_tier_growth}
      ELSE ${w.plan_tier_starter}
    END`;

    const scoreExpr = `(${catScore} + ${distScore} + ${discountScore} + ${recencyScore} + ${vendorScore} + ${featuredBonus} + ${planTierScore})`;

    const qb = this.dataSource
      .createQueryBuilder()
      .select('o.*')
      .addSelect('v.business_name', 'business_name')
      .addSelect('v.logo_url', 'vendor_logo')
      .addSelect('v.lat', 'vlat')
      .addSelect('v.lng', 'vlng')
      .addSelect('v.category', 'vendor_category')
      .addSelect('v.city', 'vendor_city')
      .addSelect('v.address', 'vendor_address')
      .addSelect('v.phone', 'vendor_phone')
      .addSelect('v.website', 'vendor_website')
      .addSelect('v.subscription_plan', 'subscription_plan')
      .addSelect(distExpr !== 'NULL' ? `ROUND(${distExpr}::numeric, 1)` : 'NULL', 'distance')
      .addSelect(`ROUND((${scoreExpr})::numeric, 4)`, 'score')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (distExpr !== 'NULL') qb.setParameters({ ulat: lat, ulng: lng });

    const searchClause = this.buildSearchClause(search);
    if (searchClause) qb.andWhere(searchClause.clause, searchClause.params);
    this.applyFeedFilters(qb, { category, distanceKm, filter, distExpr }, w);

    const countQb = this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (distExpr !== 'NULL') countQb.setParameters({ ulat: lat, ulng: lng });
    if (searchClause) countQb.andWhere(searchClause.clause, searchClause.params);
    this.applyFeedFilters(countQb, { category, distanceKm, filter, distExpr }, w);

    const { total } = await countQb.getRawOne();

    // Explicit sort choice (from the feed's sort dropdown) overrides the
    // default relevance ordering — done server-side so pagination stays
    // correct instead of only sorting whatever page happened to be fetched.
    if (sort === 'discount') {
      qb.orderBy('o.discount_percent', 'DESC', 'NULLS LAST').addOrderBy('o.created_at', 'DESC');
    } else if (sort === 'views') {
      qb.orderBy('o.views', 'DESC', 'NULLS LAST').addOrderBy('o.created_at', 'DESC');
    } else if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // Nearest offers first when we know where the user is; vendors without
      // coordinates go last. Score/recency break ties at the same distance.
      qb.orderBy(distExpr, 'ASC', 'NULLS LAST')
        .addOrderBy('score', 'DESC')
        .addOrderBy('o.created_at', 'DESC');
    } else {
      qb.orderBy('score', 'DESC')
        .addOrderBy('o.is_featured', 'DESC')
        .addOrderBy('o.created_at', 'DESC');
    }

    const rawOffers = await qb
      .limit(limit)
      .offset(offset)
      .getRawMany();
    const offers = await this.attachBadgeTiers(rawOffers);

    if (userId && search) {
      this.userInteractionRepo
        .insert({ user_id: userId, offer_id: null, action: InteractionAction.SEARCH, search_term: search })
        .catch(() => {});
    }

    return { offers, total: +total };
  }

  async trending(
    city: string, lat: number, lng: number, page: number, perPage = 20, search = '',
    category = '', distanceKm = 0, filter = '', sort = '',
  ) {
    const limit = clampLimit(perPage, 20, 500);
    const offset = (Math.max(page, 1) - 1) * limit;
    const w = await this.feedConfig.getWeights();

    // Bound as :ulat/:ulng (not interpolated) — see personalized() note.
    const distExpr = Number.isFinite(lat) && Number.isFinite(lng)
      ? `ROUND((6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(:ulat)) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(:ulng)) +
           SIN(RADIANS(:ulat)) * SIN(RADIANS(v.lat))
         ))))::numeric, 1)`
      : 'NULL';

    const popularityScore = `o.views * ${w.trending_view_weight} + o.clicks * ${w.trending_click_weight} + o.saves * ${w.trending_save_weight}`;

    const qb = this.dataSource
      .createQueryBuilder()
      .select('o.*')
      .addSelect('v.business_name', 'business_name')
      .addSelect('v.logo_url', 'vendor_logo')
      .addSelect('v.city', 'vendor_city')
      .addSelect('v.address', 'vendor_address')
      .addSelect('v.phone', 'vendor_phone')
      .addSelect('v.website', 'vendor_website')
      .addSelect('v.subscription_plan', 'subscription_plan')
      .addSelect(distExpr, 'distance')
      .addSelect(popularityScore, 'popularity')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (distExpr !== 'NULL') qb.setParameters({ ulat: lat, ulng: lng });
    if (city) {
      qb.andWhere('(v.city ILIKE :city OR o.category IS NOT NULL)', { city });
    }
    const searchClause = this.buildSearchClause(search);
    if (searchClause) qb.andWhere(searchClause.clause, searchClause.params);
    this.applyFeedFilters(qb, { category, distanceKm, filter, distExpr }, w);

    const countQb = this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (distExpr !== 'NULL') countQb.setParameters({ ulat: lat, ulng: lng });
    if (city) {
      countQb.andWhere('(v.city ILIKE :city OR o.category IS NOT NULL)', { city });
    }
    if (searchClause) countQb.andWhere(searchClause.clause, searchClause.params);
    this.applyFeedFilters(countQb, { category, distanceKm, filter, distExpr }, w);

    const countRow = await countQb.getRawOne();
    // Postgres COUNT(*) comes back as a string via getRawOne() — coerce like
    // personalized() does, or clients doing arithmetic on `total` (paging,
    // `total > 0` checks) get string concatenation instead of addition.
    const total = +(countRow?.total ?? 0);

    if (sort === 'discount') {
      qb.orderBy('o.discount_percent', 'DESC', 'NULLS LAST').addOrderBy('o.created_at', 'DESC');
    } else if (sort === 'views') {
      qb.orderBy('o.views', 'DESC', 'NULLS LAST').addOrderBy('o.created_at', 'DESC');
    } else {
      qb.orderBy('popularity', 'DESC').addOrderBy('o.created_at', 'DESC');
    }

    const rawOffers = await qb
      .limit(limit)
      .offset(offset)
      .getRawMany();
    const offers = await this.attachBadgeTiers(rawOffers);

    return { offers, total: +total };
  }

  async nearby(lat: number, lng: number, radiusKm: number, page: number) {
    const limit = 100;
    const offset = (page - 1) * limit;
    const distExpr = `(6371 * ACOS(GREATEST(-1, LEAST(1,
      COS(RADIANS(:lat)) * COS(RADIANS(v.lat)) *
      COS(RADIANS(v.lng) - RADIANS(:lng)) +
      SIN(RADIANS(:lat)) * SIN(RADIANS(v.lat))
    ))))`;

    const offers = await this.dataSource
      .createQueryBuilder()
      .select('o.id', 'id')
      .addSelect('o.title', 'title')
      .addSelect('o.description', 'description')
      .addSelect('o.category', 'category')
      .addSelect('o.discount_percent', 'discount_percent')
      .addSelect('o.offer_price', 'offer_price')
      .addSelect('o.original_price', 'original_price')
      .addSelect('o.image_url', 'image_url')
      .addSelect('o.valid_until', 'valid_until')
      .addSelect('o.views', 'views')
      .addSelect('o.vendor_id', 'vendor_id')
      .addSelect('v.business_name', 'business_name')
      .addSelect('v.logo_url', 'vendor_logo')
      .addSelect('v.lat', 'vlat')
      .addSelect('v.lng', 'vlng')
      .addSelect('v.city', 'vendor_city')
      .addSelect(distExpr, 'distance')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'")
      .andWhere('v.lat IS NOT NULL AND v.lng IS NOT NULL')
      .andWhere(`${distExpr} <= :radius`)
      .setParameters({ lat, lng, radius: radiusKm })
      .orderBy(distExpr, 'ASC')
      .addOrderBy('o.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();

    return offers;
  }

  async saved(userId: number, page: number) {
    const limit = 100;
    const offset = (page - 1) * limit;

    return this.dataSource
      .createQueryBuilder()
      .select('o.*')
      .addSelect('v.business_name', 'business_name')
      .addSelect('v.logo_url', 'vendor_logo')
      .addSelect('v.city', 'vendor_city')
      .from(SavedOffer, 'so')
      .innerJoin(Offer, 'o', 'so.offer_id = o.id')
      .innerJoin(Vendor, 'v', 'o.vendor_id = v.id')
      .where('so.user_id = :userId', { userId })
      .orderBy('so.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();
  }

  async unsave(userId: number, offerId: number) {
    await this.savedOfferRepo.delete({ user_id: userId, offer_id: offerId });
    await this.offerRepo.decrement({ id: offerId }, 'saves', 1);
    return { removed: true };
  }

  async savedIds(userId: number) {
    const rows = await this.savedOfferRepo.find({
      where: { user_id: userId },
      select: ['offer_id'],
    });
    return rows.map((r: any) => r.offer_id);
  }

  async logInteraction(userId: number, offerId: number, action: string) {
    const validActions = ['view', 'click', 'save', 'redeem', 'share', 'skip', 'direction'];
    if (!validActions.includes(action)) throw new Error('Invalid action');

    const offer = await this.offerRepo.findOne({
      where: { id: offerId },
      select: ['id', 'category', 'vendor_id', 'max_redemptions', 'current_redemptions', 'coins_required'],
    });
    if (!offer) throw new Error('Offer not found');

    // NOTE: `click` no longer feeds offers.clicks — the clicks counter now
    // means "unique users who redeemed or asked for directions".
    const colMap: Record<string, string> = { view: 'views', save: 'saves' };

    // Coin-exclusive deals: first redeem charges the user's coin wallet.
    // Charge and the redeem row commit together — a crash can't take coins
    // without recording the redemption (or vice versa).
    if (action === 'redeem' && (offer as any).coins_required > 0) {
      await this.dataSource.transaction(async (em) => {
        // A plain SELECT inside a transaction doesn't lock anything under
        // READ COMMITTED — two concurrent redeem taps could both see "not
        // paid" before either commits, both deduct coins, and both insert a
        // redeem row. The advisory lock serializes concurrent calls for this
        // exact user+offer so the second call's check runs only after the
        // first has committed (or rolled back).
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`redeem:${userId}:${offerId}`]);
        const paid = await em.query(
          `SELECT 1 FROM user_interactions
            WHERE user_id = $1 AND offer_id = $2 AND action = 'redeem'
           UNION
           SELECT 1 FROM redemption_codes WHERE user_id = $1 AND offer_id = $2
           LIMIT 1`, [userId, offerId]);
        if (!paid.length) {
          const res = await em.query(
            `UPDATE users SET coins = coins - $1
              WHERE id = $2 AND coins >= $1 RETURNING coins`,
            [(offer as any).coins_required, userId]);
          if (!res.length) {
            throw new Error(`This deal needs ${(offer as any).coins_required} coins — earn more by daily check-ins and referrals`);
          }
        }
        await em.query(
          `INSERT INTO user_interactions (user_id, offer_id, action, category)
           VALUES ($1, $2, 'redeem', $3)`,
          [userId, offerId, offer.category]);
      });

      // Row already written inside the transaction — finish the counters and exit
      const prior = await this.userInteractionRepo
        .createQueryBuilder('ui')
        .where("ui.user_id = :userId AND ui.offer_id = :offerId AND ui.action = 'redeem'", { userId, offerId })
        .getCount();
      if (prior === 1) {
        await this.offerRepo.increment({ id: offerId }, 'clicks', 1);
      }
      const fresh = await this.offerRepo.findOne({
        where: { id: offerId },
        select: ['id', 'max_redemptions', 'current_redemptions'],
      });
      if (fresh && (fresh.max_redemptions ?? 0) > 0 && (fresh.current_redemptions ?? 0) >= (fresh.max_redemptions ?? 0)) {
        throw new Error('Redemption limit reached');
      }
      await this.offerRepo.increment({ id: offerId }, 'current_redemptions', 1);
      if (offer.category) await this.updatePreferences(userId, offer.category, offerId, action);
      return { recorded: true, vendor_id: offer.vendor_id };
    }

    // Every action is deduped against the same user+offer+action inside a
    // rolling 1-hour window. This used to be a separate SELECT-then-save()
    // — racy for view/click (two near-simultaneous requests could both pass
    // the check before either committed) and entirely absent for
    // save/redeem/direction (every repeat tap unconditionally inserted a new
    // row and re-ran every counter below it, duplicating both the
    // interaction list and, for redeem, silently consuming a shared
    // redemption-limit slot per tap). A single INSERT ... WHERE NOT EXISTS
    // statement is NOT enough by itself — under READ COMMITTED, two
    // concurrent connections running that same statement can both evaluate
    // "not exists" against a snapshot that includes neither's own uncommitted
    // row, so both insert (verified: 5 parallel requests produced 2 rows).
    // The advisory lock serializes concurrent calls for this exact
    // user+offer+action so the second call's WHERE NOT EXISTS runs only
    // after the first has committed.
    // redeem is deduped for the user's entire lifetime, not a rolling window
    // — max_redemptions is a single fixed pool shared across every customer,
    // so letting one user re-redeem hourly would drain it alone before
    // anyone else gets a chance. view/click/save/direction intentionally
    // keep the 1-hour window (repeat engagement after that is real signal,
    // and none of them touch a shared finite counter the way redeem does).
    const since = action === 'redeem'
      ? new Date(0)
      : new Date(Date.now() - 60 * 60 * 1000);
    const inserted: Array<{ id: number }> = await this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ui:${userId}:${offerId}:${action}`]);
      return em.query(
        `INSERT INTO user_interactions (user_id, offer_id, action, category)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM user_interactions
           WHERE user_id = $1 AND offer_id = $2 AND action = $3 AND created_at >= $5
         )
         RETURNING id`,
        [userId, offerId, action, offer.category, since],
      );
    });

    if (inserted.length === 0) {
      if (offer.category) await this.updatePreferences(userId, offer.category, offerId, action);
      return { recorded: false, vendor_id: offer.vendor_id };
    }

    if (colMap[action]) {
      await this.offerRepo.increment({ id: offerId }, colMap[action], 1);
    }

    // Clicks are unique per user PER ACTION (lifetime): the first-ever
    // redeem and the first-ever direction each bump offers.clicks once;
    // later repeats — even outside the 1-hour window above — never do.
    if (action === 'redeem' || action === 'direction') {
      const priorCount = await this.userInteractionRepo
        .createQueryBuilder('ui')
        .where('ui.user_id = :userId AND ui.offer_id = :offerId AND ui.action = :action', {
          userId, offerId, action,
        })
        .getCount();
      if (priorCount === 1) {
        await this.offerRepo.increment({ id: offerId }, 'clicks', 1);
      }
    }

    if (action === 'save') {
      await this.savedOfferRepo
        .createQueryBuilder()
        .insert()
        .into(SavedOffer)
        .values({ user_id: userId, offer_id: offerId })
        .orIgnore()
        .execute();
    }
    if (action === 'redeem') {
      const fresh = await this.offerRepo.findOne({
        where: { id: offerId },
        select: ['id', 'max_redemptions', 'current_redemptions'],
      });
      if (fresh && (fresh.max_redemptions ?? 0) > 0 && (fresh.current_redemptions ?? 0) >= (fresh.max_redemptions ?? 0)) {
        throw new Error('Redemption limit reached');
      }
      await this.offerRepo.increment({ id: offerId }, 'current_redemptions', 1);
    }

    if (offer.category) await this.updatePreferences(userId, offer.category, offerId, action);
    return { recorded: true, vendor_id: offer.vendor_id };
  }

  private async updatePreferences(userId: number, category: string, _offerId: number, action: string) {
    const weight = action === 'save' || action === 'redeem' ? 2 : action === 'click' ? 1 : action === 'skip' ? -1 : 0;
    if (weight === 0) return;

    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const row = await this.userPrefRepo.findOne({ where: { user_id: userId } });
    let categories: string[] = safeJson(row?.preferred_categories);

    if (weight > 0 && category && !categories.includes(category)) {
      categories.push(category);
      categories = categories.slice(-10);
    } else if (weight < 0) {
      categories = categories.filter((c: string) => c !== category);
    }

    if (row) {
      await this.userPrefRepo.update(
        { user_id: userId },
        { preferred_categories: JSON.stringify(categories) as any },
      );
    } else {
      await this.userPrefRepo.save({
        user_id: userId,
        preferred_categories: JSON.stringify(categories) as any,
        preferred_vendors: '[]' as any,
      });
    }
  }
}
