import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  if (lat2 === 0 && lng2 === 0) return 999;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class FeedService {
  constructor(@InjectDataSource() private db: DataSource) {}

  async totalActiveOffers(): Promise<number> {
    const [[{ total }]] = await this.db.query(
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

    const [prefs] = await this.db.query(
      'SELECT * FROM user_preferences WHERE user_id = ?',
      [userId],
    );
    const preferredCategories: string[] = prefs?.preferred_categories ?? [];
    const preferredVendors: number[] = prefs?.preferred_vendors ?? [];

    const searchClause = search
      ? `AND (o.title LIKE ? OR v.business_name LIKE ? OR o.category LIKE ? OR o.description LIKE ?)`
      : '';
    const searchParams = search
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.lat as vlat, v.lng as vlng, v.category as vendor_category,
              v.city as vendor_city, v.address as vendor_address,
              v.phone as vendor_phone, v.website as vendor_website
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved'
         ${searchClause}
       ORDER BY o.is_featured DESC, o.created_at DESC
       LIMIT 500`,
      searchParams,
    );

    const scored = offers.map((offer: any) => {
      let score = 0;
      const vlat = parseFloat(offer.vlat) || 0;
      const vlng = parseFloat(offer.vlng) || 0;

      const catMatch = preferredCategories.includes(offer.category) ? 1.0 : (offer.category ? 0.3 : 0);
      score += catMatch * 0.35;

      const dist = vlat && vlng ? haversine(lat, lng, vlat, vlng) : 0;
      const distScore =
        dist <= 1 ? 1.0 : dist <= 5 ? 0.8 : dist <= 10 ? 0.5 : dist <= 20 ? 0.3 : 0.1;
      score += (vlat && vlng ? distScore : 0.8) * 0.25;

      score += Math.min((parseFloat(offer.discount_percent) || 0) / 100, 1.0) * 0.20;

      const ageHours = (Date.now() - new Date(offer.created_at).getTime()) / 3600000;
      const recency = ageHours < 24 ? 1.0 : ageHours < 72 ? 0.7 : ageHours < 168 ? 0.4 : 0.1;
      score += recency * 0.1;

      score += (preferredVendors.includes(offer.vendor_id) ? 1.0 : 0) * 0.1;
      if (offer.is_featured) score += 0.05;

      return { ...offer, score: Math.round(score * 10000) / 10000, distance: Math.round(dist * 10) / 10 };
    });

    scored.sort((a: any, b: any) => b.score - a.score);

    const start = (page - 1) * limit;
    return { offers: scored.slice(start, start + limit), total: scored.length };
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

    const [[{ total }]] = await this.db.query(
      `SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_active = 1 AND (o.valid_until IS NULL OR o.valid_until >= NOW())
         AND v.status = 'approved' ${whereExtra}`,
      params,
    );

    const offers = await this.db.query(
      `SELECT o.*, v.business_name, v.logo_url as vendor_logo,
              v.lat as vlat, v.lng as vlng, v.city as vendor_city
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

    const data = offers.map((o: any) => ({
      ...o,
      distance: o.vlat && o.vlng ? Math.round(haversine(lat, lng, parseFloat(o.vlat), parseFloat(o.vlng)) * 10) / 10 : null,
    }));

    return { offers: data, total: +total };
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
      await this.db.query(
        'UPDATE offers SET current_redemptions = current_redemptions + 1 WHERE id = ?',
        [offerId],
      );
    }

    await this.updatePreferences(userId, offer.category, offerId, action);
    return { recorded: true, vendor_id: offer.vendor_id };
  }

  private async updatePreferences(userId: number, category: string, offerId: number, action: string) {
    const weight = action === 'save' || action === 'redeem' ? 2 : action === 'click' ? 1 : action === 'skip' ? -1 : 0;
    if (weight === 0) return;

    const [row] = await this.db.query('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    let categories: string[] = row?.preferred_categories ?? [];

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
