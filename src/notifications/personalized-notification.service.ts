import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserInteraction, InteractionAction } from '../entities/user-interaction.entity';
import { PushService } from '../services/push.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';

interface Candidate {
  userId: number;
  templateType: string;
  placeholders: Record<string, string>;
}

@Injectable()
export class PersonalizedNotificationService {
  private readonly logger = new Logger(PersonalizedNotificationService.name);

  constructor(
    @InjectRepository(UserInteraction) private readonly interactionRepo: Repository<UserInteraction>,
    private readonly pushService: PushService,
    private readonly templateService: NotificationTemplateService,
    private readonly capService: NotificationCapService,
  ) {}

  // Runs hourly; each run looks at a 1-hour window that's exactly 1-2h old, so
  // a given search is only ever considered once (and the user has had time to act on it).
  @Cron(CronExpression.EVERY_HOUR, { name: 'personalized_search_notif', timeZone: 'Asia/Kolkata' })
  async runSearchFollowUp() {
    const candidates = await this.findAbandonedSearches();
    if (!candidates.length) {
      this.logger.log('Search follow-up: no candidates');
      return;
    }

    const userIds = await this.capService.filterSendable(candidates.map((c) => c.userId), 'personalized');
    const allowed = candidates.filter((c) => userIds.includes(c.userId));

    let sent = 0;
    for (const c of allowed) {
      const tpl = await this.templateService.pickRandom(c.templateType);
      if (!tpl) continue;
      const title = this.substitute(tpl.title, c.placeholders);
      const body = this.substitute(tpl.body, c.placeholders);
      const n = await this.pushService.send(c.userId, title, body, { route: tpl.route, type: c.templateType });
      sent += n;
    }
    this.logger.log(`Search follow-up: ${allowed.length} candidates, ${sent} sent`);
  }

  /** Rule: searched 1-2h ago, no save/redeem since that search. */
  private async findAbandonedSearches(): Promise<Candidate[]> {
    const windowEnd = new Date(Date.now() - 60 * 60 * 1000);
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const searches = await this.interactionRepo
      .createQueryBuilder('ui')
      .where('ui.action = :action', { action: InteractionAction.SEARCH })
      .andWhere('ui.created_at BETWEEN :start AND :end', { start: windowStart, end: windowEnd })
      .andWhere('ui.search_term IS NOT NULL')
      .orderBy('ui.created_at', 'DESC')
      .getMany();

    if (!searches.length) return [];

    // One candidate per user — most recent search in the window
    const latestByUser = new Map<number, UserInteraction>();
    for (const s of searches) {
      if (!latestByUser.has(s.user_id)) latestByUser.set(s.user_id, s);
    }

    const candidates: Candidate[] = [];
    for (const [userId, search] of latestByUser) {
      const followUp = await this.interactionRepo
        .createQueryBuilder('ui')
        .where('ui.user_id = :userId', { userId })
        .andWhere('ui.action IN (:...actions)', { actions: [InteractionAction.SAVE, InteractionAction.REDEEM] })
        .andWhere('ui.created_at > :since', { since: search.created_at })
        .getCount();

      if (followUp === 0) {
        candidates.push({
          userId,
          templateType: 'personalized_search',
          placeholders: { term: search.search_term ?? '' },
        });
      }
    }
    return candidates;
  }

  private substitute(text: string, placeholders: Record<string, string>): string {
    return Object.entries(placeholders).reduce(
      (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
      text,
    );
  }
}
