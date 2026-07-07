import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isPrimaryInstance } from '../common/utils/cron-guard';

/**
 * Nightly retention for the append-only log tables.
 *
 * Every request writes an api_logs row and there is no other cleanup path,
 * so without this job the log tables grow without bound (disk, backup size,
 * monitoring-dashboard query time). Security-relevant tables get a longer
 * window than traffic logs.
 */
@Injectable()
export class LogRetentionService {
  private readonly logger = new Logger(LogRetentionService.name);

  // table -> days to keep
  private static readonly RETENTION: Record<string, number> = {
    api_logs: 30,
    auth_logs: 90,
    error_logs: 90,
    alert_logs: 90,
    security_events: 180,
    notification_outbox: 30,
    activity_logs: 90,
  };

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron('30 3 * * *', { name: 'log_retention', timeZone: 'Asia/Kolkata' })
  async pruneOldLogs() {
    if (!isPrimaryInstance()) return;
    for (const [table, days] of Object.entries(LogRetentionService.RETENTION)) {
      try {
        const result = await this.dataSource.query(
          // table names come from the static map above, never from input
          `DELETE FROM ${table} WHERE created_at < NOW() - ($1 || ' days')::interval`,
          [days],
        );
        const deleted = Array.isArray(result) ? result[1] : result?.affectedRows;
        this.logger.log(`log_retention: ${table} pruned (kept ${days}d, deleted ${deleted ?? '?'})`);
      } catch (err: any) {
        // A missing table or column must not stop the remaining tables.
        this.logger.warn(`log_retention: ${table} skipped — ${err?.message}`);
      }
    }
  }
}
