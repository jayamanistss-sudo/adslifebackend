import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushService } from '../services/push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly push: PushService,
  ) {}

  async list(userId: number, limit = 30) {
    const rows = await this.db.query(
      `SELECT id, user_id, title, body, type, offer_id, is_read, created_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(limit, 100)],
    );
    const [unreadRow] = await this.db.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId],
    );
    return {
      notifications: rows.map((r: any) => ({
        ...r,
        id: +r.id,
        user_id: +r.user_id,
        offer_id: r.offer_id === null ? null : +r.offer_id,
        is_read: +r.is_read,
      })),
      unread_count: +unreadRow.cnt,
    };
  }

  async markRead(userId: number, notificationId?: number) {
    if (notificationId) {
      await this.db.query(
        'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [notificationId, userId],
      );
    } else {
      await this.db.query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1',
        [userId],
      );
    }
    return { updated: true };
  }

  async saveToken(userId: number, token: string, platform = 'web') {
    await this.db.query(
      'INSERT INTO user_fcm_tokens (user_id, token, platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id=$4, platform=$5',
      [userId, token, platform, userId, platform],
    );
    return { saved: true };
  }

  async trigger(userIds: number | number[], title: string, body: string, data: Record<string, string> = {}) {
    const sent = await this.push.send(userIds, title, body, data);
    return { sent };
  }
}
