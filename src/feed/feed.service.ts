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
       WHERE o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'`,
    );
    return +total;
  }

  async personalized(userId: number, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const [prefs] = await this.db.query('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    const preferredCategories: string[] = JSON.parse(prefs?.preferred_categories ?? '[]');
    const preferredVendors: number[] = JSON.parse(prefs?.preferred_vendors ?? '[]');

    const catList = preferredCategories.length
      ? preferredCategories.map(() => '?').join(',')
      : null;
    const vendorList = preferredVendors.length
      ? preferredVendors.map(() => '?').join(',')
      : null;

    const searchClause = search
      ? `AND (o.title LIKE ? OR v.business_name LIKE ? OR o.category LIKE ? OR o.description LIKE ?)`
      : '';
    const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [];

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

    const catScore = catList
      ? `CASE WHEN o.category IN (${catList}) THEN 0.35 WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`
      : `CASE WHEN o.category IS NOT NULL THEN 0.105 ELSE 0 END`;

    const vendorScore = vendorList
      ? `CASE WHEN o.vendor_id IN (${vendorList}) THEN 0.10 ELSE 0 END`
      : '0';

    const recencyScore = `CASE
      WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)  THEN 0.10
      WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)  THEN 0.07
      WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN 0.04
      ELSE 0.01
    END`;

    const discountScore = `LEAST(COALESCE(o.discount_percent, 0) / 100, 1.0) * 0.20`;
    const featuredBonus = `IF(o.is_featured, 0.05, 0)`;

    const scoreExpr = `(${catScore} + ${distScore} + ${discountScore} + ${recencyScore} + ${vendorScore} + ${featuredBonus})`;

    const params: any[] = [
      ...(catList ? preferredCategories : []),
      ...(catList ? preferredCategories : []),
      ...(vendorList ? preferredVendors : []),
      ...searchParams,
    ];

    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1 AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved' ${searchClause}`,
      searchParams,
    );

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.lat as vlat, v.lng as vlng, v.category as vendor_category,
              v.city as vendor_city, v.address as vendor_address,
              v.phone as vendor_phone, v.website as vendor_website,
              ${distExpr !== 'NULL' ? `ROUND(${distExpr}, 1)` : 'NULL'} as distance,
              ROUND(${scoreExpr}, 4) as score
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         ${searchClause}
       ORDER BY score DESC, o.is_featured DESC, o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return { offers, total: +total };
  }

  async trending(city: string, lat: number, lng: number, page: number, perPage = 20, search = '') {
    const limit = perPage;
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const clauses: string[] = [];
    if (city) { clauses.push('(v.city = ? OR o.category IS NOT NULL)'); params.push(city); }
    if (search) {
      clauses.push('(o.title LIKE ? OR v.business_name LIKE ? OR o.category LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereExtra = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1 AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved' ${whereExtra}`,
      params,
    );

    const distExpr = lat && lng
      ? `ROUND(6371 * ACOS(GREATEST(-1, LEAST(1,
           COS(RADIANS(${lat})) * COS(RADIANS(v.lat)) *
           COS(RADIANS(v.lng) - RADIANS(${lng})) +
           SIN(RADIANS(${lat})) * SIN(RADIANS(v.lat))
         ))), 1)`
      : 'NULL';

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.city as vendor_city, ${distExpr} as distance
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         ${whereExtra}
       ORDER BY (o.views + o.clicks * 2 + o.saves * 3) DESC, o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return { offers, total: +total };
  }

  async nearby(lat: number, lng: number, radiusKm: number, page: number) {
    const limit = 100;
    const offset = (page - 1) * limit;

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.lat as vlat, v.lng as vlng, v.city as vendor_city,
              (6371 * ACOS(
                COS(RADIANS(?)) * COS(RADIANS(v.lat)) *
                COS(RADIANS(v.lng) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(v.lat))
              )) AS distance
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         AND v.lat IS NOT NULL AND v.lng IS NOT NULL
       HAVING distance <= ?
       ORDER BY distance ASC, o.created_at DESC
       LIMIT ? OFFSET ?`,
      [lat, lng, lat, radiusKm, limit, offset],
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
       WHERE so.user_id = ?
       ORDER BY so.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );
  }

  async unsave(userId: number, offerId: number) {
    await this.db.query('DELETE FROM saved_offers WHERE user_id = ? AND offer_id = ?', [userId, offerId]);
    await this.db.query('UPDATE offers SET saves = GREATEST(0, saves - 1) WHERE id = ?', [offerId]);
    return { removed: true };
  }

  async savedIds(userId: number) {
    const rows = await this.db.query(
      'SELECT offer_id FROM saved_offers WHERE user_id = ?',
      [userId],
    );
    return rows.map((r: any) => r.offer_id);
  }

  async logInteraction(userId: number, offerId: number, action: string) {
    const validActions = ['view', 'click', 'save', 'redeem', 'share', 'skip'];
    if (!validActions.includes(action)) throw new Error('Invalid action');

    const [offer] = await this.db.query('SELECT category, vendor_id FROM offers WHERE id = ?', [offerId]);
    if (!offer) throw new Error('Offer not found');

    await this.db.query(
      'INSERT INTO user_interactions (user_id, offer_id, action, category) VALUES (?,?,?,?)',
      [userId, offerId, action, offer.category],
    );

    const colMap: Record<string, string> = { view: 'views', click: 'clicks', save: 'saves' };
    if (colMap[action]) {
      await this.db.query(
        `UPDATE offers SET ${colMap[action]} = ${colMap[action]} + 1 WHERE id = ?`,
        [offerId],
      );
    }

    if (action === 'save') {
      await this.db.query(
        'INSERT IGNORE INTO saved_offers (user_id, offer_id) VALUES (?, ?)',
        [userId, offerId],
      );
    }
    if (action === 'redeem') {
      const result = await this.db.query(
        `UPDATE offers SET current_redemptions = current_redemptions + 1
         WHERE id = ? AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)`,
        [offerId],
      );
      if (result.affectedRows === 0) throw new Error('Redemption limit reached');
    }

    await this.updatePreferences(userId, offer.category, offerId, action);
    return { recorded: true, vendor_id: offer.vendor_id };
  }

  private async updatePreferences(userId: number, category: string, offerId: number, action: string) {
    const weight = action === 'save' || action === 'redeem' ? 2 : action === 'click' ? 1 : action === 'skip' ? -1 : 0;
    if (weight === 0) return;

    const [row] = await this.db.query('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    let categories: string[] = JSON.parse(row?.preferred_categories ?? '[]');

    if (weight > 0 && category && !categories.includes(category)) {
      categories.push(category);
      categories = categories.slice(-10);
    } else if (weight < 0) {
      categories = categories.filter((c: string) => c !== category);
    }

    if (row) {
      await this.db.query(
        'UPDATE user_preferences SET preferred_categories=?, updated_at=NOW() WHERE user_id=?',
        [JSON.stringify(categories), userId],
      );
    } else {
      await this.db.query(
        'INSERT INTO user_preferences (user_id, preferred_categories, preferred_vendors) VALUES (?,?,?)',
        [userId, JSON.stringify(categories), '[]'],
      );
    }
  }
}
