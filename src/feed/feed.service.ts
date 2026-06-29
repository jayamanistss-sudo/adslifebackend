import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Offer } from '../entities/offer.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { SavedOffer } from '../entities/saved-offer.entity';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { Vendor } from '../entities/vendor.entity';

@Injectable()
export class FeedService {
  constructor(
    @InjectRepository(Offer) private readonly offerRepo: Repository<Offer>,
    @InjectRepository(UserPreference) private readonly userPrefRepo: Repository<UserPreference>,
    @InjectRepository(SavedOffer) private readonly savedOfferRepo: Repository<SavedOffer>,
    @InjectRepository(UserInteraction) private readonly userInteractionRepo: Repository<UserInteraction>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async totalActiveOffers(): Promise<number> {
    return this.offerRepo
      .createQueryBuilder('o')
      .innerJoin('vendors', 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'")
      .getCount();
  }

  async personalized(userId: number, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const prefs = await this.userPrefRepo.findOne({ where: { user_id: userId } });
    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const preferredCategories: string[] = safeJson(prefs?.preferred_categories);
    // Sanitize to positive integers to prevent SQL injection in the raw IN() clause
    const preferredVendors: number[] = safeJson(prefs?.preferred_vendors)
      .map(Number).filter((n: number) => Number.isInteger(n) && n > 0);

    const distExpr = lat && lng
      ? `(6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(${lat})) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(${lng})) +
           SIN(RADIANS(${lat})) * SIN(RADIANS(v.lat))
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

    if (search) {
      const s = `%${search}%`;
      qb.andWhere('(o.title LIKE :s1 OR v.business_name LIKE :s2 OR o.category LIKE :s3 OR o.description LIKE :s4)',
        { s1: s, s2: s, s3: s, s4: s });
    }

    const countQb = this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (search) {
      const s = `%${search}%`;
      countQb.andWhere('(o.title LIKE :s1 OR v.business_name LIKE :s2 OR o.category LIKE :s3 OR o.description LIKE :s4)',
        { s1: s, s2: s, s3: s, s4: s });
    }

    const { total } = await countQb.getRawOne();

    const offers = await qb
      .orderBy('score', 'DESC')
      .addOrderBy('o.is_featured', 'DESC')
      .addOrderBy('o.created_at', 'DESC')
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

  async trending(city: string, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const distExpr = lat && lng
      ? `ROUND((6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(${lat})) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(${lng})) +
           SIN(RADIANS(${lat})) * SIN(RADIANS(v.lat))
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

    if (city) {
      qb.andWhere('(v.city ILIKE :city OR o.category IS NOT NULL)', { city });
    }
    if (search) {
      const s = `%${search}%`;
      qb.andWhere('(o.title ILIKE :s1 OR v.business_name ILIKE :s2 OR o.category ILIKE :s3)', { s1: s, s2: s, s3: s });
    }

    const countQb = this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(Offer, 'o')
      .innerJoin(Vendor, 'v', 'v.id = o.vendor_id')
      .where('o.is_active = true')
      .andWhere('(o.valid_until IS NULL OR o.valid_until >= NOW())')
      .andWhere("v.status = 'approved'");

    if (city) {
      countQb.andWhere('(v.city ILIKE :city OR o.category IS NOT NULL)', { city });
    }
    if (search) {
      const s = `%${search}%`;
      countQb.andWhere('(o.title ILIKE :s1 OR v.business_name ILIKE :s2 OR o.category ILIKE :s3)', { s1: s, s2: s, s3: s });
    }

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
    const validActions = ['view', 'click', 'save', 'redeem', 'share', 'skip'];
    if (!validActions.includes(action)) throw new Error('Invalid action');

    const offer = await this.offerRepo.findOne({
      where: { id: offerId },
      select: ['id', 'category', 'vendor_id', 'max_redemptions', 'current_redemptions'],
    });
    if (!offer) throw new Error('Offer not found');

    const colMap: Record<string, string> = { view: 'views', click: 'clicks', save: 'saves' };

    // For view/click: skip both the row insert AND the counter increment if already logged within 1 hour.
    // This keeps user_interactions consistent with the deduplicated offers.clicks/views columns.
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

    await this.userInteractionRepo.save({
      user_id: userId,
      offer_id: offerId,
      action: action as any,
      category: offer.category,
    });

    if (colMap[action]) {
      await this.offerRepo.increment({ id: offerId }, colMap[action], 1);
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
