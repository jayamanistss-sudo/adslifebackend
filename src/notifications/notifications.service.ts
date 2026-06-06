import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(UserFcmToken) private readonly userFcmTokenRepo: Repository<UserFcmToken>,
    private readonly push: PushService,
  ) {}

  async list(userId: number, limit = 30) {
    const notifications = await this.notifRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });
    const unread_count = await this.notifRepo.count({
      where: { user_id: userId, is_read: false },
    });
    return {
      notifications: notifications.map((r: any) => ({
        ...r,
        id: +r.id,
        user_id: +r.user_id,
        offer_id: r.offer_id === null ? null : +r.offer_id,
        is_read: +r.is_read,
      })),
      unread_count,
    };
  }

  async markRead(userId: number, notificationId?: number) {
    if (notificationId) {
      await this.notifRepo.update({ id: notificationId, user_id: userId }, { is_read: true });
    } else {
      await this.notifRepo.update({ user_id: userId }, { is_read: true });
    }
    return { updated: true };
  }

  async saveToken(userId: number, token: string, platform = 'web') {
    const existing = await this.userFcmTokenRepo.findOne({ where: { token } });
    if (existing) {
      await this.userFcmTokenRepo.update({ token }, { user_id: userId, platform });
    } else {
      await this.userFcmTokenRepo.save({ user_id: userId, token, platform });
    }
    return { saved: true };
  }

  async trigger(userIds: number | number[], title: string, body: string, data: Record<string, string> = {}) {
    const sent = await this.push.send(userIds, title, body, data);
    return { sent };
  }
}
