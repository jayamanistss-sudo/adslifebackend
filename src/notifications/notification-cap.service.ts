import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';

const COMMON_TYPES = ['morning', 'lunch', 'evening', 'dinner', 'goodnight', 'weekend', 'reengage'];

// 5 daily time-of-day slots are configured (morning/lunch/evening/dinner/goodnight) —
// the common cap needs to cover all of them or the later ones (e.g. goodnight) always
// lose out to whichever fired earlier in the day.
const MAX_COMMON_PER_DAY = 5;
const MAX_PERSONALIZED_PER_DAY = 2;
const MAX_TOTAL_PER_DAY = 7;

@Injectable()
export class NotificationCapService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  /** Filters userIds down to those who haven't hit today's send cap for the given bucket. */
  async filterSendable(userIds: number[], bucket: 'common' | 'personalized'): Promise<number[]> {
    if (!userIds.length) return [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await this.notifRepo
      .createQueryBuilder('n')
      .select('n.user_id', 'user_id')
      .addSelect('n.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('n.user_id IN (:...userIds)', { userIds })
      .andWhere('n.created_at >= :startOfDay', { startOfDay })
      .groupBy('n.user_id')
      .addGroupBy('n.type')
      .getRawMany<{ user_id: number; type: string | null; count: string }>();

    const totals = new Map<number, number>();
    const commonCounts = new Map<number, number>();
    const personalizedCounts = new Map<number, number>();

    for (const r of rows) {
      const uid = r.user_id;
      const count = Number(r.count);
      totals.set(uid, (totals.get(uid) ?? 0) + count);
      if (COMMON_TYPES.includes(r.type ?? '')) {
        commonCounts.set(uid, (commonCounts.get(uid) ?? 0) + count);
      } else {
        personalizedCounts.set(uid, (personalizedCounts.get(uid) ?? 0) + count);
      }
    }

    return userIds.filter((uid) => {
      if ((totals.get(uid) ?? 0) >= MAX_TOTAL_PER_DAY) return false;
      if (bucket === 'common' && (commonCounts.get(uid) ?? 0) >= MAX_COMMON_PER_DAY) return false;
      if (bucket === 'personalized' && (personalizedCounts.get(uid) ?? 0) >= MAX_PERSONALIZED_PER_DAY) return false;
      return true;
    });
  }
}
