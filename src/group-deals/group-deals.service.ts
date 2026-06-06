import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GroupDealsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(userId: number, userRole: string, dto: {
    offer_id: number; min_members: number; max_members?: number; duration_hours?: number;
  }) {
    if (userRole === 'admin') {
      const [offer] = await this.db.query('SELECT id FROM offers WHERE id = $1', [dto.offer_id]);
      if (!offer) throw new NotFoundException('Offer not found');
    } else {
      const [vendor] = await this.db.query('SELECT id FROM vendors WHERE user_id = $1', [userId]);
      if (!vendor) throw new ForbiddenException('Vendor profile not found');
      const [offer] = await this.db.query('SELECT id FROM offers WHERE id = $1 AND vendor_id = $2', [dto.offer_id, vendor.id]);
      if (!offer) throw new NotFoundException('Offer not found or does not belong to your vendor profile');
    }

    const hours = dto.duration_hours ?? 24;
    const result = await this.db.query(
      `INSERT INTO group_deals (offer_id, min_members, max_members, status, expires_at)
       VALUES ($1, $2, $3, 'active', NOW() + ($4 * INTERVAL '1 hour'))
       RETURNING id`,
      [dto.offer_id, dto.min_members, dto.max_members ?? null, hours],
    );
    return { id: result[0].id, offer_id: dto.offer_id, min_members: dto.min_members, expires_in_hours: hours };
  }

  async getActive(lat: number, lng: number) {
    return this.db.query(
      `SELECT gd.*, o.title as offer_title, o.image_url, o.discount_percent,
              v.business_name, v.city as vendor_city,
              (SELECT COUNT(*) FROM group_deal_members gdm WHERE gdm.deal_id = gd.id) as current_members
       FROM group_deals gd
       JOIN offers o ON gd.offer_id = o.id
       JOIN vendors v ON o.vendor_id = v.id
       WHERE gd.status = 'active'
         AND gd.expires_at > NOW()
       ORDER BY gd.created_at DESC`,
    );
  }

  async join(userId: number, dealId: number) {
    const [deal] = await this.db.query(
      'SELECT * FROM group_deals WHERE id = $1 AND status = \'active\' AND expires_at > NOW()',
      [dealId],
    );
    if (!deal) throw new NotFoundException('Group deal not found or expired');

    const result = await this.db.transaction(async (manager) => {
      const [existing] = await manager.query(
        'SELECT id FROM group_deal_members WHERE deal_id = $1 AND user_id = $2 FOR UPDATE',
        [dealId, userId],
      );
      if (existing) throw new BadRequestException('Already joined this deal');

      await manager.query(
        'INSERT INTO group_deal_members (deal_id, user_id) VALUES ($1, $2)',
        [dealId, userId],
      );

      const [{ cnt }] = await manager.query(
        'SELECT COUNT(*) as cnt FROM group_deal_members WHERE deal_id = $1',
        [dealId],
      );
      const currentMembers = +cnt;

      if (currentMembers >= deal.min_members) {
        await manager.query('UPDATE group_deals SET status = \'fulfilled\' WHERE id = $1', [dealId]);
      }
      return currentMembers;
    });

    return { joined: true, current_members: result, min_members: deal.min_members, fulfilled: result >= deal.min_members };
  }

  async status(dealId: number) {
    const [deal] = await this.db.query(
      `SELECT gd.*, o.title as offer_title, o.discount_percent,
              (SELECT COUNT(*) FROM group_deal_members gdm WHERE gdm.deal_id = gd.id) as current_members
       FROM group_deals gd JOIN offers o ON gd.offer_id = o.id
       WHERE gd.id = $1`,
      [dealId],
    );
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }
}
