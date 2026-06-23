import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, ObjectLiteral, Repository } from 'typeorm';
import { AuthLog, AuthAction } from '../entities/auth-log.entity';
import { ActivityLog } from '../entities/activity-log.entity';
import { ApiLog } from '../entities/api-log.entity';
import { ErrorLog } from '../entities/error-log.entity';
import { SecurityEvent } from '../entities/security-event.entity';
import { AlertLog } from '../entities/alert-log.entity';
import { BlockedIp } from '../entities/blocked-ip.entity';
import { User, UserRole } from '../entities/user.entity';
import { MailService } from '../mail/mail.service';

const SENSITIVE = new Set([
  'password', 'password_hash', 'token', 'otp', 'secret', 'api_key',
  'access_token', 'refresh_token', 'authorization', 'credit_card',
  'cvv', 'pin', 'reset_token', 'current_password', 'new_password',
  'x-api-key', 'card_number', 'expiry', 'ssn',
]);

export function sanitize(obj: any, depth = 0): any {
  if (depth > 4 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map(i => sanitize(i, depth + 1));
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE.has(k.toLowerCase()) ? '[REDACTED]' : sanitize(v, depth + 1);
  }
  return out;
}

function trunc(s: any, max = 2000): string | null {
  if (s === null || s === undefined) return null;
  const str = String(s);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function subtractMinutes(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(AuthLog) private readonly authLogRepo: Repository<AuthLog>,
    @InjectRepository(ActivityLog) private readonly activityLogRepo: Repository<ActivityLog>,
    @InjectRepository(ApiLog) private readonly apiLogRepo: Repository<ApiLog>,
    @InjectRepository(ErrorLog) private readonly errorLogRepo: Repository<ErrorLog>,
    @InjectRepository(SecurityEvent) private readonly securityEventRepo: Repository<SecurityEvent>,
    @InjectRepository(AlertLog) private readonly alertLogRepo: Repository<AlertLog>,
    @InjectRepository(BlockedIp) private readonly blockedIpRepo: Repository<BlockedIp>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  // ─── Writers (fire-and-forget safe) ─────────────────────────────────────────

  async logRequest(d: {
    requestId: string; userId?: number; role?: string; ipAddress: string;
    method: string; endpoint: string; statusCode: number;
    requestBody?: any; responseBody?: any; userAgent?: string;
    deviceInfo?: any; responseTimeMs: number; isSuspicious?: boolean;
  }) {
    try {
      await this.apiLogRepo.save({
        request_id: d.requestId,
        user_id: d.userId ?? null,
        role: d.role ?? null,
        ip_address: d.ipAddress,
        method: d.method,
        endpoint: trunc(d.endpoint, 500) ?? '',
        status_code: d.statusCode,
        request_body: d.requestBody ? JSON.stringify(sanitize(d.requestBody)) : null,
        response_body: d.responseBody ? JSON.stringify(sanitize(d.responseBody)) : null,
        user_agent: trunc(d.userAgent, 500) ?? null,
        device_info: d.deviceInfo ?? null,
        response_time_ms: d.responseTimeMs,
        is_suspicious: d.isSuspicious ?? false,
      });
    } catch { /* never block pipeline */ }
  }

  async logAuth(d: {
    requestId?: string; userId?: number; email?: string; role?: string;
    action: 'login_success'|'login_failure'|'logout'|'register'|
            'forgot_password'|'reset_password'|'token_invalid'|'unauthorized';
    ipAddress: string; userAgent?: string; deviceInfo?: any;
    failureReason?: string; metadata?: any;
  }) {
    try {
      await this.authLogRepo.save({
        request_id: d.requestId ?? null,
        user_id: d.userId ?? null,
        email: d.email ?? null,
        role: d.role ?? null,
        action: d.action as AuthAction,
        ip_address: d.ipAddress,
        user_agent: trunc(d.userAgent, 500),
        device_info: d.deviceInfo ?? null,
        failure_reason: trunc(d.failureReason, 500),
        metadata: d.metadata ? sanitize(d.metadata) : null,
      });
    } catch { /* never throw */ }
  }

  async logActivity(d: {
    requestId?: string; userId: number; role: string; action: string;
    entityType?: string; entityId?: number; description?: string;
    metadata?: any; ipAddress?: string;
  }) {
    try {
      await this.activityLogRepo.save({
        request_id: d.requestId ?? null,
        user_id: d.userId,
        role: d.role,
        action: d.action,
        entity_type: d.entityType ?? null,
        entity_id: d.entityId ?? null,
        description: trunc(d.description, 500),
        metadata: d.metadata ? sanitize(d.metadata) : null,
        ip_address: d.ipAddress ?? null,
      });
    } catch { /* never throw */ }
  }

  async logError(d: {
    requestId?: string; userId?: number; ipAddress?: string;
    endpoint?: string; method?: string; statusCode?: number;
    errorType: string; errorMessage: string; stackTrace?: string; metadata?: any;
  }) {
    try {
      await this.errorLogRepo.save({
        request_id: d.requestId ?? null,
        user_id: d.userId ?? null,
        ip_address: d.ipAddress ?? null,
        endpoint: trunc(d.endpoint, 500),
        method: d.method ?? null,
        status_code: d.statusCode ?? null,
        error_type: trunc(d.errorType, 100) as string,
        error_message: trunc(d.errorMessage, 2000) as string,
        stack_trace: process.env.APP_ENV === 'production' ? null : trunc(d.stackTrace, 5000),
        metadata: d.metadata ? sanitize(d.metadata) : null,
      });
    } catch { /* never throw */ }
  }

  async logSecurityEvent(d: {
    eventType: string; severity: 'low'|'medium'|'high'|'critical';
    userId?: number; ipAddress: string; endpoint?: string;
    description: string; metadata?: any;
  }) {
    try {
      await this.securityEventRepo.save({
        event_type: d.eventType,
        severity: d.severity,
        user_id: d.userId ?? null,
        ip_address: d.ipAddress,
        endpoint: d.endpoint ?? null,
        description: trunc(d.description, 2000) ?? '',
        metadata: d.metadata ?? null,
      });
    } catch { /* never throw */ }
  }

  async logAlert(d: {
    alertType: string; severity: 'info'|'warning'|'error'|'critical';
    title: string; message: string; metadata?: any; channels?: string[];
  }) {
    try {
      const channels = d.channels ?? ['dashboard'];

      await this.alertLogRepo.save({
        alert_type: d.alertType,
        severity: d.severity,
        title: trunc(d.title, 255) as string,
        message: trunc(d.message, 2000) as string,
        metadata: d.metadata ?? null,
        notified_channels: channels,
      });

      if (channels.includes('email') && (d.severity === 'error' || d.severity === 'critical')) {
        await this.maybeSendAlertEmail(d.alertType, d.title, d.message, d.severity);
      }
    } catch { /* never throw */ }
  }

  /**
   * Throttled per alert_type — at most one email every 15 minutes for the
   * same alert_type, so a sustained incident (e.g. repeated 500s during a
   * network outage) doesn't flood the admin's inbox with one email per error.
   */
  private async maybeSendAlertEmail(alertType: string, title: string, message: string, severity: string): Promise<void> {
    const recentlyEmailed = await this.alertLogRepo
      .createQueryBuilder('a')
      .where('a.alert_type = :alertType', { alertType })
      .andWhere('a.created_at >= :since', { since: subtractMinutes(15) })
      .andWhere(`a.notified_channels::jsonb @> '["email"]'::jsonb`)
      .getCount();
    if (recentlyEmailed > 1) return; // the row this call just inserted always counts as 1

    const admins = await this.userRepo.find({ where: { role: UserRole.ADMIN }, select: ['email'] });
    if (!admins.length) return;

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#dc2626;margin:0 0 4px;">⚠ ${severity.toUpperCase()}: ${title}</h2>
        <p style="color:#555;font-size:14px;line-height:1.6;white-space:pre-wrap;">${message}</p>
        <p style="color:#999;font-size:11px;margin-top:20px;">alert_type: ${alertType} · ${new Date().toISOString()}</p>
      </div>`;

    await Promise.all(
      admins.map((a) => this.mail.send(a.email, `[AdsLife Alert] ${title}`, html).catch(() => {})),
    );
  }

  // ─── Blocked IP ──────────────────────────────────────────────────────────────

  async isBlockedIp(ip: string): Promise<boolean> {
    try {
      const now = new Date();
      const row = await this.blockedIpRepo
        .createQueryBuilder('b')
        .where('b.ip_address = :ip', { ip })
        .andWhere('(b.expires_at IS NULL OR b.expires_at > :now)', { now })
        .getOne();
      return !!row;
    } catch { return false; }
  }

  async blockIp(ip: string, reason: string, blockedBy: number, expiresAt?: Date) {
    const existing = await this.blockedIpRepo.findOne({ where: { ip_address: ip } });
    if (existing) {
      await this.blockedIpRepo.update(existing.id, {
        reason,
        blocked_by: blockedBy,
        expires_at: expiresAt ?? null,
      });
    } else {
      await this.blockedIpRepo.save({
        ip_address: ip,
        reason,
        blocked_by: blockedBy,
        expires_at: expiresAt ?? null,
      });
    }
  }

  async unblockIp(ip: string) {
    const result = await this.blockedIpRepo.delete({ ip_address: ip });
    return (result.affected ?? 0) > 0;
  }

  // ─── Security Helpers ────────────────────────────────────────────────────────

  async recentFailedLogins(ip: string, minutes: number): Promise<number> {
    try {
      return await this.authLogRepo.count({
        where: {
          ip_address: ip,
          action: AuthAction.LOGIN_FAILURE,
          created_at: MoreThanOrEqual(subtractMinutes(minutes)),
        },
      });
    } catch { return 0; }
  }

  async recentRequestCount(ip: string, minutes: number): Promise<number> {
    try {
      return await this.apiLogRepo.count({
        where: { ip_address: ip, created_at: MoreThanOrEqual(subtractMinutes(minutes)) },
      });
    } catch { return 0; }
  }

  async recentUnauthorizedCount(ip: string, minutes: number): Promise<number> {
    try {
      return await this.apiLogRepo.count({
        where: {
          ip_address: ip,
          status_code: In([401, 403]),
          created_at: MoreThanOrEqual(subtractMinutes(minutes)),
        },
      });
    } catch { return 0; }
  }

  // ─── Dashboard APIs ──────────────────────────────────────────────────────────

  async getOverview() {
    const today = new Date().toISOString().slice(0, 10);

    const [
      totalReq, activeUsers, failedLogins, err4xx, err5xx,
      avgResp, topApis, topIps, suspicious, unreadAlerts,
      hourlyTrend, recentErrors,
    ] = await Promise.all([
      this.apiLogRepo.createQueryBuilder('l').select('COUNT(*)', 'cnt').where('l.created_at::date = :today', { today }).getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select('COUNT(DISTINCT l.user_id)', 'cnt').where('l.created_at::date = :today AND l.user_id IS NOT NULL', { today }).getRawOne(),
      this.authLogRepo.createQueryBuilder('l').select('COUNT(*)', 'cnt').where("l.action = 'login_failure' AND l.created_at::date = :today", { today }).getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select('COUNT(*)', 'cnt').where('l.status_code BETWEEN 400 AND 499 AND l.created_at::date = :today', { today }).getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select('COUNT(*)', 'cnt').where('l.status_code >= 500 AND l.created_at::date = :today', { today }).getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select('ROUND(AVG(l.response_time_ms)::numeric, 0)', 'avg').where('l.created_at::date = :today', { today }).getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select(['l.endpoint AS endpoint', 'COUNT(*) AS count']).where('l.created_at::date = :today', { today }).groupBy('l.endpoint').orderBy('count', 'DESC').limit(10).getRawMany(),
      this.apiLogRepo.createQueryBuilder('l').select(['l.ip_address AS ip_address', 'COUNT(*) AS count']).where('l.created_at::date = :today', { today }).groupBy('l.ip_address').orderBy('count', 'DESC').limit(10).getRawMany(),
      this.securityEventRepo.createQueryBuilder('e').select('COUNT(*)', 'cnt').where('e.is_resolved = false AND e.created_at::date = :today', { today }).getRawOne(),
      this.alertLogRepo.createQueryBuilder('a').select('COUNT(*)', 'cnt').where('a.is_read = false').getRawOne(),
      this.apiLogRepo.createQueryBuilder('l').select(['EXTRACT(HOUR FROM l.created_at) AS hr', 'COUNT(*) AS count']).where('l.created_at::date = :today', { today }).groupBy('EXTRACT(HOUR FROM l.created_at)').orderBy('hr', 'ASC').getRawMany(),
      this.errorLogRepo.createQueryBuilder('e').select(['e.id', 'e.endpoint', 'e.method', 'e.status_code', 'e.error_message', 'e.created_at']).orderBy('e.created_at', 'DESC').limit(5).getMany(),
    ]);

    return {
      today,
      total_requests: +(totalReq?.cnt ?? 0),
      active_users: +(activeUsers?.cnt ?? 0),
      failed_logins: +(failedLogins?.cnt ?? 0),
      errors_4xx: +(err4xx?.cnt ?? 0),
      errors_5xx: +(err5xx?.cnt ?? 0),
      avg_response_ms: +(avgResp?.avg ?? 0),
      top_apis: topApis,
      top_ips: topIps,
      suspicious_count: +(suspicious?.cnt ?? 0),
      unread_alerts: +(unreadAlerts?.cnt ?? 0),
      hourly_trend: hourlyTrend,
      recent_errors: recentErrors,
    };
  }

  async getApiLogs(q: any) {
    return this._paginateRepo(this.apiLogRepo, 'l', q, [
      { key: 'from_date', clause: "l.created_at >= :p", transform: (v: string) => v + ' 00:00:00' },
      { key: 'to_date', clause: "l.created_at <= :p", transform: (v: string) => v + ' 23:59:59' },
      { key: 'user_id', clause: 'l.user_id = :p', transform: Number },
      { key: 'role', clause: 'l.role = :p' },
      { key: 'ip_address', clause: 'l.ip_address = :p' },
      { key: 'endpoint', clause: 'l.endpoint LIKE :p', transform: (v: string) => `%${v}%` },
      { key: 'status_code', clause: 'l.status_code = :p', transform: Number },
      { key: 'errors_only', clause: 'l.status_code >= 400', flag: true },
      { key: 'suspicious_only', clause: 'l.is_suspicious = true', flag: true },
      { key: 'search', clause: '(l.endpoint LIKE :p0 OR l.ip_address LIKE :p1 OR l.role LIKE :p2)', transform: (v: string) => [`%${v}%`, `%${v}%`, `%${v}%`] },
    ]);
  }

  async getAuthLogs(q: any) {
    return this._paginateRepo(this.authLogRepo, 'l', q, [
      { key: 'from_date', clause: "l.created_at >= :p", transform: (v: string) => v + ' 00:00:00' },
      { key: 'to_date', clause: "l.created_at <= :p", transform: (v: string) => v + ' 23:59:59' },
      { key: 'user_id', clause: 'l.user_id = :p', transform: Number },
      { key: 'ip_address', clause: 'l.ip_address = :p' },
      { key: 'action', clause: 'l.action = :p' },
      { key: 'search', clause: '(l.email LIKE :p0 OR l.ip_address LIKE :p1)', transform: (v: string) => [`%${v}%`, `%${v}%`] },
    ]);
  }

  async getActivityLogs(q: any) {
    return this._paginateRepo(this.activityLogRepo, 'l', q, [
      { key: 'from_date', clause: "l.created_at >= :p", transform: (v: string) => v + ' 00:00:00' },
      { key: 'to_date', clause: "l.created_at <= :p", transform: (v: string) => v + ' 23:59:59' },
      { key: 'user_id', clause: 'l.user_id = :p', transform: Number },
      { key: 'role', clause: 'l.role = :p' },
      { key: 'action', clause: 'l.action LIKE :p', transform: (v: string) => `%${v}%` },
      { key: 'search', clause: '(l.action LIKE :p0 OR l.description LIKE :p1)', transform: (v: string) => [`%${v}%`, `%${v}%`] },
    ]);
  }

  async getErrorLogs(q: any) {
    return this._paginateRepo(this.errorLogRepo, 'l', q, [
      { key: 'from_date', clause: "l.created_at >= :p", transform: (v: string) => v + ' 00:00:00' },
      { key: 'to_date', clause: "l.created_at <= :p", transform: (v: string) => v + ' 23:59:59' },
      { key: 'user_id', clause: 'l.user_id = :p', transform: Number },
      { key: 'status_code', clause: 'l.status_code = :p', transform: Number },
      { key: 'search', clause: '(l.error_message LIKE :p0 OR l.endpoint LIKE :p1)', transform: (v: string) => [`%${v}%`, `%${v}%`] },
    ]);
  }

  async getSecurityEvents(q: any) {
    return this._paginateRepo(this.securityEventRepo, 'e', q, [
      { key: 'from_date', clause: "e.created_at >= :p", transform: (v: string) => v + ' 00:00:00' },
      { key: 'to_date', clause: "e.created_at <= :p", transform: (v: string) => v + ' 23:59:59' },
      { key: 'ip_address', clause: 'e.ip_address = :p' },
      { key: 'severity', clause: 'e.severity = :p' },
      { key: 'search', clause: '(e.description LIKE :p0 OR e.event_type LIKE :p1)', transform: (v: string) => [`%${v}%`, `%${v}%`] },
    ]);
  }

  async getAlerts(q: any) {
    return this._paginateRepo(this.alertLogRepo, 'a', q, [
      { key: 'severity', clause: 'a.severity = :p' },
      { key: 'search', clause: '(a.title LIKE :p0 OR a.message LIKE :p1)', transform: (v: string) => [`%${v}%`, `%${v}%`] },
    ]);
  }

  async markAlertRead(id: number) {
    await this.alertLogRepo.update(id, { is_read: true });
    return { updated: true };
  }

  async getBlockedIps() {
    return this.blockedIpRepo
      .createQueryBuilder('bi')
      .leftJoin(User, 'u', 'u.id = bi.blocked_by')
      .select(['bi.*', 'u.name AS blocked_by_name'])
      .orderBy('bi.created_at', 'DESC')
      .getRawMany();
  }

  async resolveSecurityEvent(id: number, adminId: number) {
    const result = await this.securityEventRepo.update(id, {
      is_resolved: true,
      resolved_at: new Date(),
      resolved_by: adminId,
    });
    return (result.affected ?? 0) > 0;
  }

  async exportCsv(type: string, q: any): Promise<string> {
    const getRows = async () => {
      const big = { ...q, per_page: 10000, page: 1 };
      if (type === 'api_logs') return (await this.getApiLogs(big)).data;
      if (type === 'auth_logs') return (await this.getAuthLogs(big)).data;
      if (type === 'activity_logs') return (await this.getActivityLogs(big)).data;
      if (type === 'error_logs') return (await this.getErrorLogs(big)).data;
      if (type === 'security_events') return (await this.getSecurityEvents(big)).data;
      return [];
    };
    const rows = await getRows();
    if (!rows.length) return 'No data';
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((r: any) =>
        headers.map(h => {
          const v = r[h] ?? '';
          const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return `"${s.replaceAll('"', '""')}"`;
        }).join(',')
      ),
    ];
    return lines.join('\n');
  }

  // ─── Internal paginate helper ─────────────────────────────────────────────────

  private _applyFilter<T extends ObjectLiteral>(
    qb: ReturnType<Repository<T>['createQueryBuilder']>,
    f: { key: string; clause: string; transform?: (v: any) => any; flag?: boolean },
    val: any,
    idx: number,
  ): number {
    if (f.flag) {
      if (val === true || val === 'true') qb.andWhere(f.clause);
      return idx;
    }
    const mapped = f.transform ? f.transform(val) : val;
    if (Array.isArray(mapped)) {
      let clause = f.clause;
      const params: Record<string, any> = {};
      mapped.forEach((v, i) => {
        const pk = `p${idx++}`;
        clause = clause.replace(`:p${i}`, `:${pk}`);
        params[pk] = v;
      });
      qb.andWhere(clause, params);
    } else {
      const pk = `p${idx++}`;
      qb.andWhere(f.clause.replace(':p', `:${pk}`), { [pk]: mapped });
    }
    return idx;
  }

  private async _paginateRepo<T extends ObjectLiteral>(
    repo: Repository<T>,
    alias: string,
    q: any,
    filters: Array<{ key: string; clause: string; transform?: (v: any) => any; flag?: boolean }>,
  ) {
    const { page = 1, per_page = 50 } = q;
    const qb = repo.createQueryBuilder(alias);
    let idx = 0;

    for (const f of filters) {
      const val = q[f.key];
      const isEmpty = val === undefined || val === null || val === '' || val === false;
      if (isEmpty) continue;
      idx = this._applyFilter(qb, f, val, idx);
    }

    const total = await qb.getCount();
    const offset = (+page - 1) * +per_page;
    const data = await qb
      .orderBy(`${alias}.created_at`, 'DESC')
      .limit(+per_page)
      .offset(offset)
      .getMany();

    return { total, page: +page, per_page: +per_page, data };
  }
}
