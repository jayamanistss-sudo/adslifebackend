import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

function pctChange(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+100%' : '0%';
  const change = Math.round(((cur - prev) / prev) * 1000) / 10;
  return (change >= 0 ? '+' : '') + change + '%';
}

@Injectable()
export class VendorService {
  constructor(@InjectDataSource() private db: DataSource) {}

  async dashboard(userId: number) {
    const [vendor] = await this.db.query(
      `SELECT v.*, sp.name AS plan_name, sp.slug AS plan_slug,
              sp.max_offers, sp.duration_days, sp.price AS plan_price, sp.features AS plan_features,
              (SELECT COUNT(*) FROM vendor_followers WHERE vendor_id = v.id) AS live_followers
       FROM vendors v
       LEFT JOIN subscription_plans sp ON sp.slug = v.subscription_plan
       WHERE v.user_id = ?`,
      [userId],
    );
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    const vendorId = vendor.id;

    const [offerSummary] = await this.db.query(
      `SELECT COUNT(*) AS total_offers, SUM(is_active=1) AS active_offers,
              SUM(is_active=0) AS inactive_offers,
              SUM(valid_until IS NOT NULL AND valid_until < NOW() AND is_active=1) AS expired_offers,
              COALESCE(SUM(views),0) AS total_views, COALESCE(SUM(clicks),0) AS total_clicks,
              COALESCE(SUM(saves),0) AS total_saves,
              COALESCE(SUM(current_redemptions),0) AS total_redemptions
       FROM offers WHERE vendor_id = ?`,
      [vendorId],
    );

    const recentOffers = await this.db.query(
      `SELECT id, title, category, discount_percent, views, clicks, saves,
              is_active, valid_until, current_redemptions, max_redemptions
       FROM offers WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 5`,
      [vendorId],
    );

    const [cur] = await this.db.query(
      `SELECT COALESCE(SUM(action='view'),0) AS imp, COALESCE(SUM(action='click'),0) AS clk,
              COALESCE(SUM(action='save'),0) AS sv
       FROM user_interactions ui JOIN offers o ON ui.offer_id = o.id
       WHERE o.vendor_id = ? AND ui.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [vendorId],
    );
    const [prev] = await this.db.query(
      `SELECT COALESCE(SUM(action='view'),0) AS imp, COALESCE(SUM(action='click'),0) AS clk,
              COALESCE(SUM(action='save'),0) AS sv
       FROM user_interactions ui JOIN offers o ON ui.offer_id = o.id
       WHERE o.vendor_id = ?
         AND ui.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         AND ui.created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [vendorId],
    );

    const hourRows = await this.db.query(
      `SELECT HOUR(oi.created_at) AS hr, COUNT(*) AS count
       FROM offer_impressions oi JOIN offers o ON oi.offer_id = o.id
       WHERE o.vendor_id = ? AND oi.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY HOUR(oi.created_at)`,
      [vendorId],
    );
    const peakHours = Array(24).fill(0);
    for (const r of hourRows) peakHours[r.hr] = parseInt(r.count);

    const dailyTrend = await this.db.query(
      `SELECT DATE(ui.created_at) AS stat_date,
              SUM(action='view') AS impressions, SUM(action='click') AS clicks, SUM(action='save') AS saves
       FROM user_interactions ui JOIN offers o ON ui.offer_id = o.id
       WHERE o.vendor_id = ? AND ui.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY DATE(ui.created_at) ORDER BY stat_date ASC`,
      [vendorId],
    );

    const curImp = +cur.imp, prevImp = +prev.imp;
    const curClk = +cur.clk, prevClk = +prev.clk;
    const curSv = +cur.sv, prevSv = +prev.sv;
    const curEng = curImp > 0 ? Math.round(((curClk + curSv) / curImp) * 10000) / 100 : 0;
    const prevEng = prevImp > 0 ? Math.round(((prevClk + prevSv) / prevImp) * 10000) / 100 : 0;

    return {
      vendor: {
        id: vendorId,
        business_name: vendor.business_name,
        city: vendor.city,
        status: vendor.status,
        logo_url: vendor.logo_url,
        total_followers: +vendor.live_followers || 0,
        subscription_plan: vendor.subscription_plan,
        plan_name: vendor.plan_name || vendor.subscription_plan,
        plan_max_offers: +vendor.max_offers || 0,
      },
      stats: {
        impressions: curImp, clicks: curClk, saves: curSv, engagement_rate: curEng,
        impressions_trend: pctChange(curImp, prevImp),
        clicks_trend: pctChange(curClk, prevClk),
        saves_trend: pctChange(curSv, prevSv),
        engagement_trend: pctChange(Math.round(curEng), Math.round(prevEng)),
      },
      offers: {
        total: +offerSummary.total_offers || 0, active: +offerSummary.active_offers || 0,
        inactive: +offerSummary.inactive_offers || 0, expired: +offerSummary.expired_offers || 0,
        total_views: +offerSummary.total_views || 0, total_clicks: +offerSummary.total_clicks || 0,
        total_saves: +offerSummary.total_saves || 0,
        total_redemptions: +offerSummary.total_redemptions || 0,
      },
      recent_offers: recentOffers,
      peak_hours: peakHours,
      daily_trend: dailyTrend,
    };
  }

  async getMyProfile(userId: number) {
    const [vendor] = await this.db.query(
      `SELECT v.*, u.name, u.email, u.avatar_url as user_avatar
       FROM vendors v JOIN users u ON v.user_id = u.id
       WHERE v.user_id = ?`,
      [userId],
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async getProfile(vendorId: number) {
    const [vendor] = await this.db.query(
      `SELECT v.*, u.name, u.avatar_url as user_avatar
       FROM vendors v JOIN users u ON v.user_id = u.id
       WHERE v.id = ?`,
      [vendorId],
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async updateProfile(userId: number, dto: Record<string, any>) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [userId]);
    if (!vendor) throw new NotFoundException('Vendor not found');

    const allowed = ['business_name', 'category', 'city', 'address', 'phone', 'website', 'description', 'logo_url', 'lat', 'lng', 'gst_number'];
    const fields: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (dto[key] !== undefined) { fields.push(`${key} = ?`); values.push(dto[key]); }
    }
    if (fields.length === 0) return { updated: false };
    values.push(vendor.id);
    await this.db.query(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, values);
    return { updated: true };
  }

  async getFollowStatus(userId: number, vendorId: number) {
    const [row] = await this.db.query(
      'SELECT id FROM vendor_followers WHERE user_id = ? AND vendor_id = ?',
      [userId, vendorId],
    );
    const [{ cnt }] = await this.db.query(
      'SELECT COUNT(*) as cnt FROM vendor_followers WHERE vendor_id = ?',
      [vendorId],
    );
    return { following: !!row, followers_count: +cnt };
  }

  async toggleFollow(userId: number, vendorId: number) {
    const [existing] = await this.db.query(
      'SELECT id FROM vendor_followers WHERE user_id = ? AND vendor_id = ?',
      [userId, vendorId],
    );
    let following: boolean;
    if (existing) {
      await this.db.query('DELETE FROM vendor_followers WHERE user_id = ? AND vendor_id = ?', [userId, vendorId]);
      following = false;
    } else {
      await this.db.query('INSERT IGNORE INTO vendor_followers (user_id, vendor_id) VALUES (?, ?)', [userId, vendorId]);
      following = true;
    }
    const [{ cnt }] = await this.db.query('SELECT COUNT(*) as cnt FROM vendor_followers WHERE vendor_id = ?', [vendorId]);
    return { following, followers_count: +cnt };
  }

  async follow(userId: number, vendorId: number) {
    const [v] = await this.db.query('SELECT id FROM vendors WHERE id = ?', [vendorId]);
    if (!v) throw new NotFoundException('Vendor not found');

    await this.db.query(
      'INSERT IGNORE INTO vendor_followers (user_id, vendor_id) VALUES (?, ?)',
      [userId, vendorId],
    );
    await this.db.query(
      'UPDATE vendors SET total_followers = (SELECT COUNT(*) FROM vendor_followers WHERE vendor_id = ?) WHERE id = ?',
      [vendorId, vendorId],
    );
    return { following: true };
  }

  async unfollow(userId: number, vendorId: number) {
    await this.db.query(
      'DELETE FROM vendor_followers WHERE user_id = ? AND vendor_id = ?',
      [userId, vendorId],
    );
    await this.db.query(
      'UPDATE vendors SET total_followers = (SELECT COUNT(*) FROM vendor_followers WHERE vendor_id = ?) WHERE id = ?',
      [vendorId, vendorId],
    );
    return { following: false };
  }

  async getFollowers(vendorId: number, limit = 20) {
    const followers = await this.db.query(
      `SELECT u.id, u.name, u.avatar_url, u.city, vf.created_at as followed_at
       FROM vendor_followers vf JOIN users u ON vf.user_id = u.id
       WHERE vf.vendor_id = ? ORDER BY vf.created_at DESC LIMIT ?`,
      [vendorId, limit],
    );

    const [[{ total }], [{ this_month }], [{ last_month }]] = await Promise.all([
      this.db.query('SELECT COUNT(*) as total FROM vendor_followers WHERE vendor_id = ?', [vendorId]),
      this.db.query(
        `SELECT COUNT(*) as this_month FROM vendor_followers
         WHERE vendor_id = ? AND MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())`,
        [vendorId],
      ),
      this.db.query(
        `SELECT COUNT(*) as last_month FROM vendor_followers
         WHERE vendor_id = ? AND MONTH(created_at)=MONTH(DATE_SUB(NOW(),INTERVAL 1 MONTH))
           AND YEAR(created_at)=YEAR(DATE_SUB(NOW(),INTERVAL 1 MONTH))`,
        [vendorId],
      ),
    ]);

    const tm = +this_month, lm = +last_month;
    const growth_pct = lm > 0 ? Math.round(((tm - lm) / lm) * 1000) / 10 : tm > 0 ? 100 : 0;

    return {
      total: +total,
      this_month: tm,
      last_month: lm,
      growth_pct,
      followers,
    };
  }

  async getFollowing(userId: number) {
    return this.db.query(
      `SELECT v.id, v.business_name, v.logo_url, v.category, v.city, vf.created_at as followed_at
       FROM vendor_followers vf JOIN vendors v ON vf.vendor_id = v.id
       WHERE vf.user_id = ? ORDER BY vf.created_at DESC`,
      [userId],
    );
  }

  async myPlan(userId: number) {
    const [vendor] = await this.db.query(
      `SELECT v.subscription_plan, v.plan_expires_at, sp.*
       FROM vendors v LEFT JOIN subscription_plans sp ON sp.slug = v.subscription_plan
       WHERE v.user_id = ?`,
      [userId],
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async budgetSuggest(userId: number) {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [userId]);
    if (!vendor) throw new NotFoundException('Vendor not found');

    const [stats] = await this.db.query(
      `SELECT COALESCE(SUM(action='view'),0) AS views, COALESCE(SUM(action='click'),0) AS clicks
       FROM user_interactions ui JOIN offers o ON ui.offer_id = o.id
       WHERE o.vendor_id = ? AND ui.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [vendor.id],
    );
    const ctr = stats.views > 0 ? (stats.clicks / stats.views) * 100 : 0;
    const suggestedBudget = ctr > 5 ? 2000 : ctr > 2 ? 1000 : 500;

    return {
      current_ctr: Math.round(ctr * 100) / 100,
      suggested_budget_inr: suggestedBudget,
      recommendation: ctr > 5
        ? 'Your CTR is excellent. Consider upgrading to a premium plan for more reach.'
        : ctr > 2
        ? 'Good engagement. A mid-tier plan would help grow your audience.'
        : 'Focus on improving offer quality to boost CTR before scaling budget.',
    };
  }
}
