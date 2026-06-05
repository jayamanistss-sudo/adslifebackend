import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushService } from '../services/push.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly push: PushService,
    private readonly monitoring: MonitoringService,
  ) {}

  async getStats() {
    const [[users], [vendors], [offers], [totalOffers]] = await Promise.all([
      this.db.query('SELECT COUNT(*) as cnt FROM users'),
      this.db.query('SELECT COUNT(*) as cnt FROM vendors WHERE status = "approved"'),
      this.db.query('SELECT COUNT(*) as cnt FROM offers WHERE is_active = 1'),
      this.db.query('SELECT COUNT(*) as cnt FROM offers'),
    ]);

    const [[pendingVendors], [openTickets], [pendingBanners], [pendingSpotlights], [fraudFlags]] = await Promise.all([
      this.db.query('SELECT COUNT(*) as cnt FROM vendor_applications WHERE status = "pending"'),
      this.db.query('SELECT COUNT(*) as cnt FROM support_tickets WHERE status = "open"'),
      this.db.query('SELECT COUNT(*) as cnt FROM banner_ad_requests WHERE status = "pending"'),
      this.db.query('SELECT COUNT(*) as cnt FROM spotlight_requests WHERE status = "pending"'),
      this.db.query('SELECT COUNT(*) as cnt FROM fraud_flags WHERE status = "pending"'),
    ]);

    const [[rev]] = [await this.db.query('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status = "paid"')];
    const [[usersThisMonth], [usersLastMonth]] = await Promise.all([
      this.db.query('SELECT COUNT(*) as cnt FROM users WHERE MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())'),
      this.db.query('SELECT COUNT(*) as cnt FROM users WHERE MONTH(created_at)=MONTH(DATE_SUB(NOW(),INTERVAL 1 MONTH)) AND YEAR(created_at)=YEAR(DATE_SUB(NOW(),INTERVAL 1 MONTH))'),
    ]);
    const [[interactions], [interactionsToday]] = await Promise.all([
      this.db.query('SELECT COUNT(*) as cnt FROM user_interactions'),
      this.db.query('SELECT COUNT(*) as cnt FROM user_interactions WHERE DATE(created_at) = CURDATE()'),
    ]);

    const roles = await this.db.query('SELECT role, COUNT(*) as cnt FROM users GROUP BY role');
    const roleBreakdown: Record<string, number> = { user: 0, vendor: 0, admin: 0 };
    for (const r of roles) roleBreakdown[r.role] = +r.cnt;

    const tm = +usersThisMonth.cnt, lm = +usersLastMonth.cnt;
    let growth = 0;
    if (lm > 0) growth = Math.round(((tm - lm) / lm) * 1000) / 10;
    else if (tm > 0) growth = 100;

    const [dailyUsers, recentUsers, recentVendors] = await Promise.all([
      this.db.query('SELECT DATE(created_at) AS d, COUNT(*) AS cnt FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY d ASC'),
      this.db.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5'),
      this.db.query('SELECT v.id, v.business_name, v.status, v.subscription_plan, v.created_at, u.email FROM vendors v JOIN users u ON v.user_id = u.id ORDER BY v.created_at DESC LIMIT 5'),
    ]);

    return {
      totals: { users: +users.cnt, vendors: +vendors.cnt, offers: +offers.cnt, total_offers: +totalOffers.cnt, interactions: +interactions.cnt, revenue: Math.round(+rev.total * 100) / 100 },
      pending: { vendors: +pendingVendors.cnt, tickets: +openTickets.cnt, banners: +pendingBanners.cnt, spotlights: +pendingSpotlights.cnt, fraud: +fraudFlags.cnt },
      users: { this_month: tm, last_month: lm, growth_pct: growth, today_active: +interactionsToday.cnt, role_breakdown: roleBreakdown },
      daily_signups: dailyUsers,
      recent_users: recentUsers,
      recent_vendors: recentVendors,
    };
  }

  async getUsers(page = 1, search = '', role = '', status = '', limit = 30) {
    const offset = (page - 1) * limit;
    const conds: string[] = [];
    const p: any[] = [];
    if (search) { conds.push('(u.name LIKE ? OR u.email LIKE ? OR u.city LIKE ?)'); p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (role)   { conds.push('u.role = ?'); p.push(role); }
    if (status === 'active') conds.push('u.is_active = 1');
    else if (status === 'banned') conds.push('u.is_active = 0');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [{ total }] = await this.db.query(`SELECT COUNT(*) as total FROM users u ${where}`, p);
    const users = await this.db.query(
      `SELECT u.id, u.name, u.email, u.role, u.city, u.is_active, u.created_at,
              COALESCE((SELECT COUNT(*) FROM user_interactions WHERE user_id=u.id),0) as interactions,
              0 as login_count, 0 as follows
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...p, limit, offset],
    );
    return { users, total: +total };
  }

  async getVendors(search = '', status = '', plan = '', limit = 30, offset = 0) {
    const conds: string[] = [];
    const p: any[] = [];
    if (status) { conds.push('v.status = ?'); p.push(status); }
    if (plan)   { conds.push('v.subscription_plan = ?'); p.push(plan); }
    if (search) { conds.push('(v.business_name LIKE ? OR u.email LIKE ? OR v.city LIKE ?)'); p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [{ total }] = await this.db.query(`SELECT COUNT(*) as total FROM vendors v JOIN users u ON v.user_id = u.id ${where}`, p);
    const vendors = await this.db.query(
      `SELECT v.*, u.name, u.email, u.is_active as user_active,
              (SELECT COUNT(*) FROM offers WHERE vendor_id=v.id) as total_offers,
              (SELECT COUNT(*) FROM offers WHERE vendor_id=v.id AND is_active=1) as active_offers,
              COALESCE((SELECT SUM(views) FROM offers WHERE vendor_id=v.id),0) as total_views,
              COALESCE((SELECT SUM(clicks) FROM offers WHERE vendor_id=v.id),0) as total_clicks,
              (SELECT COUNT(*) FROM vendor_followers WHERE vendor_id=v.id) as total_followers
       FROM vendors v JOIN users u ON v.user_id = u.id ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      [...p, limit, offset],
    );
    return { vendors, total: +total };
  }

  async reviewVendor(appId: number, status: string, note: string) {
    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) throw new Error('Invalid status');

    // Load the application
    const [app] = await this.db.query('SELECT * FROM vendor_applications WHERE id = ?', [appId]);
    if (!app) throw new NotFoundException('Application not found');

    await this.db.transaction(async (manager) => {
      await manager.query('UPDATE vendor_applications SET status = ? WHERE id = ?', [status, appId]);

      if (status === 'approved') {
        const [existing] = await manager.query('SELECT id FROM vendors WHERE user_id = ?', [app.user_id]);
        if (existing) {
          await manager.query(
            'UPDATE vendors SET status = "approved", review_note = ?, business_name = ?, category = ?, city = ?, address = ?, phone = ?, website = ?, gst_number = ?, description = ? WHERE user_id = ?',
            [note || null, app.business_name, app.category, app.city, app.address, app.phone, app.website, app.gst_number, app.description, app.user_id],
          );
        } else {
          await manager.query(
            `INSERT INTO vendors (user_id, business_name, category, city, address, phone, website, gst_number, description, status, review_note, subscription_plan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, 'free')`,
            [app.user_id, app.business_name, app.category, app.city, app.address, app.phone, app.website, app.gst_number, app.description, note || null],
          );
        }
        await manager.query("UPDATE users SET role = 'vendor' WHERE id = ?", [app.user_id]);
      }
    });

    if (status === 'approved') {
      await this.push.send(app.user_id, 'Vendor Approved!', 'Your vendor account has been approved.', { type: 'vendor_approved' });
    }

    return { updated: true };
  }

  async getAdminOffers(search = '', category = '', status = '', limit = 30, offset = 0) {
    const conds: string[] = [];
    const p: any[] = [];
    if (status === 'active')   conds.push('o.is_active = 1');
    else if (status === 'inactive') conds.push('o.is_active = 0');
    else if (status === 'expired')  conds.push('o.valid_until < NOW()');
    if (category) { conds.push('o.category = ?'); p.push(category); }
    if (search)   { conds.push('(o.title LIKE ? OR v.business_name LIKE ?)'); p.push(`%${search}%`, `%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [{ total }] = await this.db.query(`SELECT COUNT(*) as total FROM offers o JOIN vendors v ON o.vendor_id=v.id JOIN users u ON v.user_id=u.id ${where}`, p);
    const offers = await this.db.query(
      `SELECT o.*, v.business_name, u.email as vendor_email
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       JOIN users u ON v.user_id = u.id
       ${where}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...p, limit, offset],
    );
    return { offers, total: +total };
  }

  async broadcast(title: string, body: string, data: Record<string, string> = {}) {
    const userIds = await this.db.query('SELECT id FROM users WHERE is_active = 1');
    const ids = userIds.map((u: any) => u.id);
    const sent = await this.push.send(ids, title, body, data);
    return { sent, total: ids.length };
  }

  async getSiteSettings() {
    const rows = await this.db.query('SELECT * FROM site_settings');
    const settings: Record<string, any> = {};
    for (const r of rows) settings[r.key] = r.value;
    return settings;
  }

  async updateSiteSettings(dto: Record<string, any>) {
    for (const [key, value] of Object.entries(dto)) {
      await this.db.query(
        'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, String(value), String(value)],
      );
    }
    return { updated: true };
  }

  async getVendorRequests() {
    return this.db.query(
      `SELECT va.*,
              u.name  AS user_name,
              u.email AS user_email
       FROM vendor_applications va
       JOIN users u ON va.user_id = u.id
       ORDER BY va.created_at DESC`,
    );
  }

  async updateUser(userId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    switch (action) {
      case 'ban':    await this.db.query('UPDATE users SET is_active = 0 WHERE id = ?', [userId]); break;
      case 'unban':  await this.db.query('UPDATE users SET is_active = 1 WHERE id = ?', [userId]); break;
      case 'delete': await this.db.query('DELETE FROM users WHERE id = ?', [userId]); break;
      case 'update_role': {
        const allowedRoles = ['user', 'vendor', 'admin'];
        if (!allowedRoles.includes(extra.role)) throw new BadRequestException('Invalid role');
        await this.db.query('UPDATE users SET role = ? WHERE id = ?', [extra.role, userId]);
        break;
      }
      default: throw new Error('Unknown action');
    }
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_user_${action}`,
        entityType: 'user', entityId: userId,
        description: `Admin ${action} on user #${userId}`,
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async updateOffer(offerId: number, action: string, extra: Record<string, any> = {}) {
    switch (action) {
      case 'activate':   await this.db.query('UPDATE offers SET is_active = 1 WHERE id = ?', [offerId]); break;
      case 'deactivate': await this.db.query('UPDATE offers SET is_active = 0 WHERE id = ?', [offerId]); break;
      case 'delete':     await this.db.query('DELETE FROM offers WHERE id = ?', [offerId]); break;
      case 'feature':
        await this.db.query('UPDATE offers SET is_featured = ? WHERE id = ?', [extra.featured ?? 1, offerId]);
        break;
      default: throw new Error('Unknown action');
    }
    return { updated: true };
  }

  async updateVendor(vendorId: number, action: string, extra: Record<string, any> = {}, adminId?: number) {
    switch (action) {
      case 'approve':  await this.db.query('UPDATE vendors SET status = "approved" WHERE id = ?', [vendorId]); break;
      case 'reject':   await this.db.query('UPDATE vendors SET status = "rejected" WHERE id = ?', [vendorId]); break;
      case 'suspend':  await this.db.query('UPDATE vendors SET status = "suspended" WHERE id = ?', [vendorId]); break;
      case 'update_plan': {
        const [plan] = await this.db.query('SELECT slug FROM subscription_plans WHERE slug = ?', [extra.plan]);
        if (!plan) throw new BadRequestException('Invalid plan');
        await this.db.query('UPDATE vendors SET subscription_plan = ? WHERE id = ?', [extra.plan, vendorId]);
        break;
      }
      default: throw new Error('Unknown action');
    }
    if (adminId) {
      setImmediate(() => this.monitoring.logActivity({
        userId: adminId, role: 'admin', action: `admin_vendor_${action}`,
        entityType: 'vendor', entityId: vendorId,
        description: `Admin ${action} on vendor #${vendorId}`,
        metadata: extra,
      }).catch(() => {}));
    }
    return { updated: true };
  }

  async syncDailyStats(targetDate?: string) {
    // Default to yesterday so today's partial data is not committed
    const date = targetDate ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    await this.db.query(
      `INSERT INTO vendor_daily_stats (vendor_id, stat_date, impressions, clicks, saves, redemptions)
       SELECT
         o.vendor_id,
         ? AS stat_date,
         COALESCE(SUM(ui.action = 'view'),  0) AS impressions,
         COALESCE(SUM(ui.action = 'click'), 0) AS clicks,
         COALESCE(SUM(ui.action = 'save'),  0) AS saves,
         COALESCE(SUM(ui.action = 'redeem'),0) AS redemptions
       FROM user_interactions ui
       JOIN offers o ON ui.offer_id = o.id
       WHERE DATE(ui.created_at) = ?
       GROUP BY o.vendor_id
       ON DUPLICATE KEY UPDATE
         impressions  = VALUES(impressions),
         clicks       = VALUES(clicks),
         saves        = VALUES(saves),
         redemptions  = VALUES(redemptions)`,
      [date, date],
    );

    const [{ affected }] = await this.db.query(
      'SELECT COUNT(*) as affected FROM vendor_daily_stats WHERE stat_date = ?',
      [date],
    );
    return { synced: true, date, vendor_rows: +affected };
  }
}
