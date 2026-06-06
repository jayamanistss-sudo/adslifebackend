import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FeedService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async totalActiveOffers(): Promise<number> {
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = true
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'`,
    );
    return +total;
  }

  async personalized(userId: number, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const [prefs] = await this.db.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const preferredCategories: string[] = safeJson(prefs?.preferred_categories);
    const preferredVendors: number[] = safeJson(prefs?.preferred_vendors);

    // Build params properly
    const buildParams = () => {
      const p: any[] = [];
      const catPH = preferredCategories.length
        ? preferredCategories.map((c) => { p.push(c); return `$${p.length}`; }).join(',')
        : null;
      const vendorPH = preferredVendors.length
        ? preferredVendors.map((v) => { p.push(v); return `$${p.length}`; }).join(',')
        : null;

      let searchClause = '';
      let searchParams: any[] = [];
      if (search) {
        const s = `%${search}%`;
        searchParams = [s, s, s, s];
        const base = p.length;
        searchClause = `AND (o.title LIKE $${base + 1} OR v.business_name LIKE $${base + 2} OR o.category LIKE $${base + 3} OR o.description LIKE $${base + 4})`;
        for (const sp of searchParams) p.push(sp);
      }

      return { p, catPH, vendorPH, searchClause, searchParams };
    };

    const { p: allParams, catPH, vendorPH, searchClause } = buildParams();

    // Distance score: buckets using Haversine approximation in SQL
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

    const catScore = catPH
      ? `CASE WHEN o.category IN (${catPH}) THEN 0.35 WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`
      : `CASE WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`;

    const vendorScore = vendorPH
      ? `CASE WHEN o.vendor_id IN (${vendorPH}) THEN 0.10 ELSE 0 END`
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

    // Build search-only params for count query
    const searchOnlyParams: any[] = [];
    let searchOnlyClause = '';
    if (search) {
      const s = `%${search}%`;
      searchOnlyParams.push(s, s, s, s);
      searchOnlyClause = `AND (o.title LIKE $1 OR v.business_name LIKE $2 OR o.category LIKE $3 OR o.description LIKE $4)`;
    }

    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = true AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved' ${searchOnlyClause}`,
      searchOnlyParams,
    );

    // Add limit and offset to allParams
    const limitIdx = allParams.length + 1;
    const offsetIdx = allParams.length + 2;

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.lat as vlat, v.lng as vlng, v.category as vendor_category,
              v.city as vendor_city, v.address as vendor_address,
              v.phone as vendor_phone, v.website as vendor_website,
              ${distExpr !== 'NULL' ? `ROUND(${distExpr}::numeric, 1)` : 'NULL'} as distance,
              ROUND((${scoreExpr})::numeric, 4) as score
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = true
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         ${searchClause}
       ORDER BY score DESC, o.is_featured DESC, o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...allParams, limit, offset],
    );

    return { offers, total: +total };
  }

  async trending(city: string, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const clauses: string[] = [];
    if (city) { params.push(city); clauses.push(`(v.city = $${params.length} OR o.category IS NOT NULL)`); }
    if (search) {
      const s = `%${search}%`;
      params.push(s, s, s);
      clauses.push(`(o.title LIKE $${params.length - 2} OR v.business_name LIKE $${params.length - 1} OR o.category LIKE $${params.length})`);
    }
    const whereExtra = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = true AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved' ${whereExtra}`,
      params,
    );

    const distExpr = lat && lng
      ? `ROUND((6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(${lat})) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(${lng})) +
           SIN(RADIANS(${lat})) * SIN(RADIANS(v.lat))
         ))))::numeric, 1)`
      : 'NULL';

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.city as vendor_city, ${distExpr} as distance
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = true
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         ${whereExtra}
       ORDER BY (o.views + o.clicks * 2 + o.saves * 3) DESC, o.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, limit, offset],
    );

    return { offers, total: +total };
  }

  async nearby(lat: number, lng: number, radiusKm: number, page: number) {
    const limit = 100;
    const offset = (page - 1) * limit;

    const offers = await this.db.query(
      `SELECT * FROM (
         SELECT o.*, v.business_name, v.logo_url as vendor_logo,
                v.lat as vlat, v.lng as vlng, v.city as vendor_city,
                (6371 * ACOS(GREATEST(-1, LEAST(1,
                  COS(RADIANS($1)) * COS(RADIANS(v.lat)) *
                  COS(RADIANS(v.lng) - RADIANS($2)) +
                  SIN(RADIANS($1)) * SIN(RADIANS(v.lat))
                )))) AS distance
         FROM offers o
         JOIN vendors v ON o.vendor_id = v.id
         WHERE o.is_active = true
           AND (o.valid_until IS NULL OR o.valid_until >= NOW())
           AND v.status = 'approved'
           AND v.lat IS NOT NULL AND v.lng IS NOT NULL
       ) sub
       WHERE sub.distance <= $3
       ORDER BY sub.distance ASC, sub.created_at DESC
       LIMIT $4 OFFSET $5`,
      [lat, lng, radiusKm, limit, offset],
    );
    return offers;
  }

  async saved(userId: number, page: number) {
    const limit = 100;
    const offset = (page - 1) * limit;
    return this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo, v.city as vendor_city
       FROM saved_offers so
       JOIN offers o ON so.offer_id = o.id
       JOIN vendors v ON o.vendor_id = v.id
       WHERE so.user_id = $1
       ORDER BY so.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
  }

  async unsave(userId: number, offerId: number) {
    await this.db.query('DELETE FROM saved_offers WHERE user_id = $1 AND offer_id = $2', [userId, offerId]);
    await this.db.query('UPDATE offers SET saves = GREATEST(0, saves - 1) WHERE id = $1', [offerId]);
    return { removed: true };
  }

  async savedIds(userId: number) {
    const rows = await this.db.query(
      'SELECT offer_id FROM saved_offers WHERE user_id = $1',
      [userId],
    );
    return rows.map((r: any) => r.offer_id);
  }

  async logInteraction(userId: number, offerId: number, action: string) {
    const validActions = ['view', 'click', 'save', 'redeem', 'share', 'skip'];
    if (!validActions.includes(action)) throw new Error('Invalid action');

    const [offer] = await this.db.query('SELECT category, vendor_id FROM offers WHERE id = $1', [offerId]);
    if (!offer) throw new Error('Offer not found');

    await this.db.query(
      'INSERT INTO user_interactions (user_id, offer_id, action, category) VALUES ($1,$2,$3,$4)',
      [userId, offerId, action, offer.category],
    );

    const colMap: Record<string, string> = { view: 'views', click: 'clicks', save: 'saves' };
    if (colMap[action]) {
      await this.db.query(
        `UPDATE offers SET ${colMap[action]} = ${colMap[action]} + 1 WHERE id = $1`,
        [offerId],
      );
    }

    if (action === 'save') {
      await this.db.query(
        'INSERT INTO saved_offers (user_id, offer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, offerId],
      );
    }
    if (action === 'redeem') {
      const [offerRow] = await this.db.query(
        'SELECT max_redemptions, current_redemptions FROM offers WHERE id = $1',
        [offerId],
      );
      if (offerRow && offerRow.max_redemptions > 0 && offerRow.current_redemptions >= offerRow.max_redemptions) {
        throw new Error('Redemption limit reached');
      }
      await this.db.query(
        'UPDATE offers SET current_redemptions = current_redemptions + 1 WHERE id = $1',
        [offerId],
      );
    }

    await this.updatePreferences(userId, offer.category, offerId, action);
    return { recorded: true, vendor_id: offer.vendor_id };
  }

  private async updatePreferences(userId: number, category: string, _offerId: number, action: string) {
    const weight = action === 'save' || action === 'redeem' ? 2 : action === 'click' ? 1 : action === 'skip' ? -1 : 0;
    if (weight === 0) return;

    const safeJson = (v: any): any[] => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
    const [row] = await this.db.query('SELECT * FROM user_preferences WHERE user_id = $1', [userId]);
    let categories: string[] = safeJson(row?.preferred_categories);

    if (weight > 0 && category && !categories.includes(category)) {
      categories.push(category);
      categories = categories.slice(-10);
    } else if (weight < 0) {
      categories = categories.filter((c: string) => c !== category);
    }

    if (row) {
      await this.db.query(
        'UPDATE user_preferences SET preferred_categories=$1, updated_at=NOW() WHERE user_id=$2',
        [JSON.stringify(categories), userId],
      );
    } else {
      await this.db.query(
        'INSERT INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES ($1,$2,$3)',
        [userId, JSON.stringify(categories), '[]'],
      );
    }
  }
}
