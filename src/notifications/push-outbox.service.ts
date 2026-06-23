import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { NotificationOutbox, NotificationOutboxStatus } from '../entities/notification-outbox.entity';
import { MonitoringService } from '../monitoring/monitoring.service';

const MAX_ATTEMPTS = 5;

@Injectable()
export class PushOutboxService {
  private readonly logger = new Logger(PushOutboxService.name);

  constructor(
    private readonly pushService: PushService,
    private readonly monitoring: MonitoringService,
    @InjectRepository(NotificationOutbox) private readonly outboxRepo: Repository<NotificationOutbox>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryPending(): Promise<void> {
    const rows = await this.outboxRepo.find({
      where: { status: NotificationOutboxStatus.PENDING, is_active: true, attempts: LessThan(MAX_ATTEMPTS) },
      take: 200,
    });
    if (!rows.length) return;

    this.logger.log(`Retrying ${rows.length} queued push notification(s)`);

    for (const row of rows) {
      const result = await this.pushService.pushOnly(
        [row.user_id], row.title, row.body, (row.data as Record<string, string>) ?? {},
      );

      if (result.sent > 0) {
        await this.outboxRepo.update(row.id, {
          status: NotificationOutboxStatus.SENT,
          is_active: false,
          updated_by: null,
        });
        continue;
      }

      const attempts = row.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;

      await this.outboxRepo.update(row.id, {
        attempts,
        last_error: result.error ?? row.last_error,
        status: exhausted ? NotificationOutboxStatus.EXHAUSTED : NotificationOutboxStatus.PENDING,
        is_active: !exhausted,
      });

      if (exhausted) {
        await this.monitoring.logAlert({
          alertType: 'push_notification_exhausted',
          severity: 'error',
          title: 'Push notification permanently failed',
          message: `Gave up retrying push to user ${row.user_id} after ${MAX_ATTEMPTS} attempts: "${row.title}" — ${result.error ?? row.last_error ?? 'unknown error'}`,
          metadata: { user_id: row.user_id, outbox_id: row.id, title: row.title },
          channels: ['dashboard', 'email'],
        });
      }
    }
  }
}
