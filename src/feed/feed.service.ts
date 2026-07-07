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

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(UserPreference) private readonly userPrefRepo: Repository<UserPreference>,
    @InjectRepository(SavedOffer) private readonly savedOfferRepo: Repository<SavedOffer>,
    @InjectRepository(UserInteraction) private readonly userInteractionRepo: Repository<UserInteraction>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

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
  ) {
    if (opts.category) {
      qb.andWhere('o.category = :fcat', { fcat: opts.category });
    }
    if (opts.distanceKm && opts.distExpr !== 'NULL') {
      qb.andWhere(`${opts.distExpr} <= :fradius`, { fradius: opts.distanceKm });
    }
    switch (opts.filter) {
      case 'flash':
        qb.andWhere('COALESCE(o.discount_percent, 0) >= 30');
        break;
      case 'trending':
        qb.andWhere('o.views > 100');
        break;
      case 'ending':
        qb.andWhere("o.valid_until IS NOT NULL AND o.valid_until <= NOW() + INTERVAL '2 days'");
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
    category = '', distanceKm = 0, filter = '',
  ) {
    const limit = clampLimit(perPage, 20, 500);
    const offset = (Math.max(page, 1) - 1) * limit;

    const prefs = await this.userPrefRepo.findOne({ where: { user_id: userId } });
    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const preferredCategories: string[] = safeJson(prefs?.preferred_categories);
    // Sanitize to positive integers to prevent SQL injection in the raw IN() clause
    const preferredVendors: number[] = safeJson(prefs?.preferred_vendors)
      .map(Number).filter((n: number) => Number.isInteger(n) && n > 0);

    // lat/lng are ParseFloatPipe-validated numbers, but bind them as query
    // parameters anyway so this expression can never become an injection point.
    const distExpr = lat && lng
      ? `(6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(:ulat)) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(:ulng)) +
           SIN(RADIANS(:ulat)) * SIN(RADIANS(v.lat))
         ))))`
      : 'NULL';

    const distScore = lat && lng
      ? `CASE
           WHEN v.lat IS NULL OR v.lng IS NULL THEN 0.20
           WHEN ${distExpr} <= 1  THEN 0.25
           WHEN ${distExpr} <= 5  THEN 0.20
           WHEN ${distExpr} <= 10 THEN 0.125
           WHEN ${distExpr} <= 20 THEN 0.075
           ELSE 0.025
         END`
      : '0.20';

    const catScore = preferredCategories.length
      ? `CASE WHEN o.category IN (${preferredCategories.map(c => `'${c.replace(/'/g, "''")}'`).join(',')}) THEN 0.35 WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`
      : `CASE WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`;

    const vendorScore = preferredVendors.length
      ? `CASE WHEN o.vendor_id IN (${preferredVendors.join(',')}) THEN 0.10 ELSE 0 END`
      : '0';

    const recencyScore = `CASE
      WHEN o.created_at >= NOW() - INTERVAL '1 day'  THEN 0.10
      WHEN o.created_at >= NOW() - INTERVAL '3 days' THEN 0.07
      WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN 0.04
      ELSE 0.01
    END`;

    const discountScore = `LEAST(COALESCE(o.discount_percent, 0) / 100, 1.0) * 0.20`;
    const featuredBonus = `CASE WHEN o.is_featured THEN 0.05 ELSE 0 END`;

    const scoreExpr = `(${catScore} + ${distScore} + ${discountScore} + ${recencyScore} + ${vendorScore} + ${featuredBonus})`;

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
    this.applyFeedFilters(qb, { category, distanceKm, filter, distExpr });

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
    this.applyFeedFilters(countQb, { category, distanceKm, filter, distExpr });

    const { total } = await countQb.getRawOne();

    // Nearest offers first when we know where the user is; vendors without
    // coordinates go last. Score/recency break ties at the same distance.
    if (lat && lng) {
      qb.orderBy(distExpr, 'ASC', 'NULLS LAST')
        .addOrderBy('score', 'DESC')
        .addOrderBy('o.created_at', 'DESC');
    } else {
      qb.orderBy('score', 'DESC')
        .addOrderBy('o.is_featured', 'DESC')
        .addOrderBy('o.created_at', 'DESC');
    }

    const offers = await qb
      .limit(limit)
      .offset(offset)
      .getRawMany();

    if (userId && search) {
      this.userInteractionRepo
        .insert({ user_id: userId, offer_id: null, action: InteractionAction.SEARCH, search_term: search })
        .catch(() => {});
    }

    return { offers, total: +total };
  }

  async trending(
    city: string, lat: number, lng: number, page: number, perPage = 20, search = '',
    category = '', distanceKm = 0, filter = '',
  ) {
    const limit = clampLimit(perPage, 20, 500);
    const offset = (Math.max(page, 1) - 1) * limit;

    // Bound as :ulat/:ulng (not interpolated) — see personalized() note.
    const distExpr = lat && lng
      ? `ROUND((6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(:ulat)) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(:ulng)) +
           SIN(RADIANS(:ulat)) * SIN(RADIANS(v.lat))
         ))))::numeric, 1)`
      : 'NULL';

    const popularityScore = `o.views + o.clicks * 2 + o.saves * 3`;

    const qb = this.dataSource
      .createQueryBuilder()
      .select('o.*')
      .addSelect('v.business_name', 'business_name')
      .addSelect('v.logo_url', 'vendor_logo')
      .addSelect('v.city', 'vendor_city')
      .addSelect('v.address', 'vendor_address')
      .addSelect('v.phone', 'vendor_phone')
      .addSelect('v.website', 'vendor_website')
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
    this.applyFeedFilters(qb, { category, distanceKm, filter, distExpr });

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
    this.applyFeedFilters(countQb, { category, distanceKm, filter, distExpr });

    const countRow = await countQb.getRawOne();
    const total = countRow?.total ?? 0;

    const offers = await qb
      .orderBy('popularity', 'DESC')
      .addOrderBy('o.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getRawMany();

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

    // For view/click: skip both the row insert AND the counter increment if already logged within 1 hour.
    if (action === 'view' || action === 'click') {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await this.userInteractionRepo
        .createQueryBuilder('ui')
        .where('ui.user_id = :userId AND ui.offer_id = :offerId AND ui.action = :action AND ui.created_at >= :since', {
          userId, offerId, action, since,
        })
        .getCount();
      if (recent > 0) {
        // Already recorded within this window — skip save and counter update
        if (offer.category) await this.updatePreferences(userId, offer.category, offerId, action);
        return { recorded: false, vendor_id: offer.vendor_id };
      }
    }

    // Coin-exclusive deals: first redeem charges the user's coin wallet.
    // Charge and the redeem row commit together — a crash can't take coins
    // without recording the redemption (or vice versa).
    if (action === 'redeem' && (offer as any).coins_required > 0) {
      await this.dataSource.transaction(async (em) => {
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

    // Clicks are unique per user PER ACTION: the first redeem and the first
    // direction each bump offers.clicks once, repeats never do.
    let firstEngagement = false;
    if (action === 'redeem' || action === 'direction') {
      const prior = await this.userInteractionRepo
        .createQueryBuilder('ui')
        .where('ui.user_id = :userId AND ui.offer_id = :offerId AND ui.action = :action', {
          userId, offerId, action,
        })
        .getCount();
      firstEngagement = prior === 0;
    }

    await this.userInteractionRepo.save({
      user_id: userId,
      offer_id: offerId,
      action: action as any,
      category: offer.category,
    });

    if (colMap[action]) {
      await this.offerRepo.increment({ id: offerId }, colMap[action], 1);
    }
    if (firstEngagement) {
      await this.offerRepo.increment({ id: offerId }, 'clicks', 1);
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
