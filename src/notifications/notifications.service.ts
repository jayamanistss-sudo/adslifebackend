import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PushService } from '../services/push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private db: DataSource,
    private push: PushService,
  ) {}

  async list(userId: number, limit = 30) {
    const rows = await this.db.query(
      `SELECT id, user_id, title, body, type, offer_id, is_read, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, Math.min(limit, 100)],
    );
    const [unreadRow] = await this.db.query(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    return {
      notifications: rows.map((r: any) => ({
        ...r,
        id: +r.id,
        user_id: +r.user_id,
        offer_id: r.offer_id !== null ? +r.offer_id : null,
        is_read: +r.is_read,
      })),
      unread_count: +unreadRow.cnt,
    };
  }

  async markRead(userId: number, notificationId?: number) {
    if (notificationId) {
      await this.db.query(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [notificationId, userId],
      );
    } else {
      await this.db.query(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
        [userId],
      );
    }
    return { updated: true };
  }

  async saveToken(userId: number, token: string, platform = 'web') {
    await this.db.query(
      'INSERT INTO user_fcm_tokens (user_id, token, platform) VALUES (?,?,?) ON DUPLICATE KEY UPDATE user_id=?, platform=?',
      [userId, token, platform, userId, platform],
    );
    return { saved: true };
  }

  async trigger(userIds: number | number[], title: string, body: string, data: Record<string, string> = {}) {
    const sent = await this.push.send(userIds, title, body, data);
    return { sent };
  }
}
