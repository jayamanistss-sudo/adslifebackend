import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { Notification } from '../entities/notification.entity';
import { PushService } from '../services/push.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { isPrimaryInstance } from '../common/utils/cron-guard';

// Weights reflect intent strength: saving/redeeming signals much stronger interest than just viewing
const ACTION_WEIGHT: Record<string, number> = {
  [InteractionAction.SAVE]:   4,
  [InteractionAction.REDEEM]: 3,
  [InteractionAction.SEARCH]: 2,
  [InteractionAction.CLICK]:  2,
  [InteractionAction.VIEW]:   1,
};

const MIN_SCORE      = 5;   // minimum weighted score to qualify
const COOLDOWN_HOURS = 48;  // don't send interest notification to same user within this window
const LOOKBACK_DAYS  = 30;

@Injectable()
export class InterestNotificationService {
  private readonly logger = new Logger(InterestNotificationService.name);

  constructor(
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
    @InjectRepository(Notification)    private readonly notifRepo:       Repository<Notification>,
    @InjectRepository(UserFcmToken)    private readonly tokenRepo:        Repository<UserFcmToken>,
    private readonly pushService:      PushService,
    private readonly templateService:  NotificationTemplateService,
    private readonly capService:       NotificationCapService,
  ) {}

  // 2:00 PM IST daily
  @Cron('0 14 * * *', { name: 'interest_notif', timeZone: 'Asia/Kolkata' })
  async run() {
    if (!isPrimaryInstance()) return;
    const candidates = await this.buildCandidates();
    if (!candidates.length) {
      this.logger.log('Interest notify: no candidates');
      return;
    }

    const allowedIds = await this.capService.filterSendable(
      candidates.map((c) => c.userId),
      'personalized',
    );
    const allowed = candidates.filter((c) => allowedIds.includes(c.userId));

    let sent = 0;
    for (const c of allowed) {
      const tpl = await this.templateService.pickRandom('interest_alert');
      if (!tpl) continue;
      const title = this.sub(tpl.title, { category: c.topCategory });
      const body  = this.sub(tpl.body,  { category: c.topCategory });
      const n = await this.pushService.send(c.userId, title, body, {
        route: `/feed?category=${c.topCategory}`,
        type: 'interest_alert',
      });
      sent += n;
    }
    this.logger.log(`Interest notify: ${allowed.length} candidates → ${sent} sent`);
  }

  private async buildCandidates(): Promise<{ userId: number; topCategory: string; score: number }[]> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
    const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 3600000);

    // Only consider users who have an FCM token (otherwise there's no device to push to)
    const tokens = await this.tokenRepo.find({ select: ['user_id'] });
    const activeUserIds = [...new Set(tokens.map((t) => t.user_id))];
    if (!activeUserIds.length) return [];

    // Pull all category interactions for active users in the lookback window
    const rows = await this.interactionRepo
      .createQueryBuilder('ui')
      .select('ui.user_id', 'user_id')
      .addSelect('ui.category', 'category')
      .addSelect('ui.action', 'action')
      .addSelect('COUNT(*)', 'cnt')
      .where('ui.user_id IN (:...activeUserIds)', { activeUserIds })
      .andWhere('ui.category IS NOT NULL')
      .andWhere("ui.category != ''")
      .andWhere('ui.created_at >= :since', { since })
      .groupBy('ui.user_id')
      .addGroupBy('ui.category')
      .addGroupBy('ui.action')
      .getRawMany<{ user_id: string; category: string; action: string; cnt: string }>();

    // Compute weighted score per user per category
    const scoreMap = new Map<string, number>(); // key = `userId:category`
    for (const r of rows) {
      const weight = ACTION_WEIGHT[r.action] ?? 1;
      const key = `${r.user_id}:${r.category}`;
      scoreMap.set(key, (scoreMap.get(key) ?? 0) + weight * Number(r.cnt));
    }

    // Find top category per user
    const topByUser = new Map<number, { category: string; score: number }>();
    for (const [key, score] of scoreMap) {
      const [uid, category] = key.split(':');
      const userId = Number(uid);
      const existing = topByUser.get(userId);
      if (!existing || score > existing.score) {
        topByUser.set(userId, { category, score });
      }
    }

    // Filter: score threshold + cooldown (no interest_alert in last 48h)
    const recentNotifs = await this.notifRepo
      .createQueryBuilder('n')
      .select('DISTINCT n.user_id', 'user_id')
      .where('n.user_id IN (:...activeUserIds)', { activeUserIds })
      .andWhere('n.type = :type', { type: 'interest_alert' })
      .andWhere('n.created_at >= :cooldownSince', { cooldownSince })
      .getRawMany<{ user_id: string }>();

    const recentlySent = new Set(recentNotifs.map((r) => Number(r.user_id)));

    const candidates: { userId: number; topCategory: string; score: number }[] = [];
    for (const [userId, { category, score }] of topByUser) {
      if (score < MIN_SCORE) continue;
      if (recentlySent.has(userId)) continue;
      candidates.push({ userId, topCategory: category, score });
    }

    return candidates;
  }

  private sub(text: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
      text,
    );
  }
}
