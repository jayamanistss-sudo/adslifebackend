import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class GroupDealsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

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
      'SELECT * FROM group_deals WHERE id = ? AND status = "active" AND expires_at > NOW()',
      [dealId],
    );
    if (!deal) throw new NotFoundException('Group deal not found or expired');

    const result = await this.db.transaction(async (manager) => {
      const [existing] = await manager.query(
        'SELECT id FROM group_deal_members WHERE deal_id = ? AND user_id = ? FOR UPDATE',
        [dealId, userId],
      );
      if (existing) throw new BadRequestException('Already joined this deal');

      await manager.query(
        'INSERT INTO group_deal_members (deal_id, user_id) VALUES (?, ?)',
        [dealId, userId],
      );

      const [{ cnt }] = await manager.query(
        'SELECT COUNT(*) as cnt FROM group_deal_members WHERE deal_id = ?',
        [dealId],
      );
      const currentMembers = +cnt;

      if (currentMembers >= deal.min_members) {
        await manager.query('UPDATE group_deals SET status = "fulfilled" WHERE id = ?', [dealId]);
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
       WHERE gd.id = ?`,
      [dealId],
    );
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }
}
