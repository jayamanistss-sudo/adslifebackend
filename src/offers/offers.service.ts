import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateOfferDto, UpdateOfferDto } from './dto/create-offer.dto';
import { PushService } from '../services/push.service';
import { NotificationsGateway } from '../gateway/notifications.gateway';

@Injectable()
export class OffersService {
  constructor(
    @InjectDataSource() private db: DataSource,
    private push: PushService,
    private gateway: NotificationsGateway,
  ) {}

  private async getVendorId(userId: number): Promise<number> {
    const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = ?', [userId]);
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor.id;
  }

  async create(userId: number, dto: CreateOfferDto) {
    const vendorId = await this.getVendorId(userId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');

    const validFrom = dto.valid_from ? dto.valid_from + ' 00:00:00' : null;
    const validUntil = dto.valid_until ? dto.valid_until + ' 23:59:59' : null;

    const result = await this.db.query(
      `INSERT INTO offers (vendor_id, title, description, category, discount_percent,
        original_price, offer_price, image_url, coupon_code, redeem_url, max_redemptions,
        valid_from, valid_until, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        vendorId, dto.title.trim(), dto.description?.trim() || null,
        dto.category?.trim() || 'general', dto.discount_percent ?? null,
        dto.original_price ?? null, dto.offer_price ?? null,
        dto.image_url?.trim() || null, dto.coupon_code?.trim() || null,
        dto.redeem_url?.trim() || null, dto.max_redemptions ?? 0,
        validFrom, validUntil,
      ],
    );
    const offerId = result.insertId;

    // Notify all subscribers of this vendor (fire-and-forget)
    this.notifySubscribers(vendorId, offerId, dto.title.trim(), dto.discount_percent).catch(() => {});

    return { id: offerId };
  }

  private async notifySubscribers(vendorId: number, offerId: number, title: string, discountPercent?: number) {
    const [vendor] = await this.db.query('SELECT business_name FROM vendors WHERE id = ?', [vendorId]);
    if (!vendor) return;

    const followers = await this.db.query(
      'SELECT user_id FROM vendor_followers WHERE vendor_id = ?',
      [vendorId],
    );
    if (!followers.length) return;

    const userIds: number[] = followers.map((f: any) => f.user_id);
    const discount = discountPercent ? ` — ${discountPercent}% OFF` : '';
    const notifTitle = `New offer from ${vendor.business_name}`;
    const notifBody  = `${title}${discount}`;
    const payload = {
      type:       'new_offer',
      offer_id:   offerId,
      vendor_id:  vendorId,
      title:      notifTitle,
      body:       notifBody,
      created_at: new Date().toISOString(),
    };

    // Real-time via WebSocket (instant, for users currently in the app)
    this.gateway.sendToUsers(userIds, 'notification', payload);

    // Push notification via FCM (for users not currently in the app)
    await this.push.send(userIds, notifTitle, notifBody, {
      type:      'new_offer',
      offer_id:  String(offerId),
      vendor_id: String(vendorId),
    });
  }

  async update(userId: number, offerId: number, dto: UpdateOfferDto, role: string) {
    const [offer] = await this.db.query('SELECT vendor_id FROM offers WHERE id = ?', [offerId]);
    if (!offer) throw new NotFoundException('Offer not found');

    if (role !== 'admin') {
      const vendorId = await this.getVendorId(userId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    }

    const fields: string[] = [];
    const values: any[] = [];

    // Treat empty strings the same as null so editing never wipes existing data
    const trimOrNull = (v: string | undefined) => (v?.trim() || null);
    const map: Record<string, any> = {
      title:            dto.title?.trim() || undefined,
      description:      trimOrNull(dto.description),
      category:         dto.category?.trim() || undefined,
      image_url:        trimOrNull(dto.image_url),
      coupon_code:      trimOrNull(dto.coupon_code),
      redeem_url:       trimOrNull(dto.redeem_url),
      discount_percent: dto.discount_percent ?? undefined,
      original_price:   dto.original_price   ?? undefined,
      offer_price:      dto.offer_price       ?? undefined,
      max_redemptions:  dto.max_redemptions   ?? undefined,
      is_active: dto.is_active !== undefined ? (dto.is_active ? 1 : 0) : undefined,
      valid_from:  dto.valid_from  ? dto.valid_from  + ' 00:00:00' : undefined,
      valid_until: dto.valid_until ? dto.valid_until + ' 23:59:59' : undefined,
    };

    for (const [key, val] of Object.entries(map)) {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (fields.length === 0) throw new BadRequestException('No fields to update');
    values.push(offerId);
    await this.db.query(`UPDATE offers SET ${fields.join(', ')} WHERE id = ?`, values);
    return { updated: true };
  }

  async delete(userId: number, offerId: number, role: string) {
    const [offer] = await this.db.query('SELECT vendor_id FROM offers WHERE id = ?', [offerId]);
    if (!offer) throw new NotFoundException('Offer not found');

    if (role !== 'admin') {
      const vendorId = await this.getVendorId(userId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenException('Access denied');
    }

    await this.db.query('DELETE FROM offers WHERE id = ?', [offerId]);
    return { deleted: true };
  }

  async detail(offerId: number) {
    const [offer] = await this.db.query(
      `SELECT
         o.id,
         o.vendor_id          AS vendorId,
         o.title,
         o.description,
         o.category,
         o.discount_percent   AS discountPercent,
         o.original_price     AS originalPrice,
         o.offer_price        AS offerPrice,
         o.image_url          AS imageUrl,
         o.coupon_code        AS couponCode,
         o.redeem_url         AS redeemUrl,
         o.max_redemptions    AS maxRedemptions,
         o.current_redemptions AS currentRedemptions,
         o.valid_from         AS validFrom,
         o.valid_until        AS validUntil,
         o.is_active          AS isActive,
         o.is_featured        AS isFeatured,
         o.views,
         o.clicks,
         o.saves,
         v.business_name      AS businessName,
         v.logo_url           AS vendorLogo,
         v.city               AS vendorCity,
         v.address            AS vendorAddress,
         v.phone              AS vendorPhone,
         v.website            AS vendorWebsite,
         v.lat                AS vendorLat,
         v.lng                AS vendorLng,
         v.category           AS vendorCategory,
         v.description        AS vendorDescription
       FROM offers o
       JOIN vendors v ON o.vendor_id = v.id
       WHERE o.id = ?`,
      [offerId],
    );
    if (!offer) throw new NotFoundException('Offer not found');
    // coerce numeric strings
    const toNum = (v: any) => (v == null ? null : Number.parseFloat(v));
    return {
      ...offer,
      discountPercent: toNum(offer.discountPercent),
      originalPrice:   toNum(offer.originalPrice),
      offerPrice:      toNum(offer.offerPrice),
      vendorLat:       toNum(offer.vendorLat),
      vendorLng:       toNum(offer.vendorLng),
    };
  }

  async trackView(offerId: number) {
    await this.db.query('UPDATE offers SET views = views + 1 WHERE id = ?', [offerId]);
  }

  async myOffers(userId: number) {
    const vendorId = await this.getVendorId(userId);
    return this.db.query(
      `SELECT id, title, category, description, discount_percent,
              original_price, offer_price, image_url, coupon_code, redeem_url,
              views, clicks, saves, is_active, valid_from, valid_until,
              current_redemptions, max_redemptions, created_at
       FROM offers WHERE vendor_id = ? ORDER BY created_at DESC`,
      [vendorId],
    );
  }
}
