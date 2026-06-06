import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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

@Injectable()
export class MonitoringService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── Writers (fire-and-forget safe) ─────────────────────────────────────────

  async logRequest(d: {
    requestId: string; userId?: number; role?: string; ipAddress: string;
    method: string; endpoint: string; statusCode: number;
    requestBody?: any; responseBody?: any; userAgent?: string;
    deviceInfo?: any; responseTimeMs: number; isSuspicious?: boolean;
  }) {
    try {
      await this.db.query(
        `INSERT INTO api_logs (request_id,user_id,role,ip_address,method,endpoint,status_code,
          request_body,response_body,user_agent,device_info,response_time_ms,is_suspicious)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          d.requestId, d.userId ?? null, d.role ?? null, d.ipAddress,
          d.method, trunc(d.endpoint, 500), d.statusCode,
          d.requestBody ? JSON.stringify(sanitize(d.requestBody)) : null,
          d.responseBody ? JSON.stringify(sanitize(d.responseBody)) : null,
          trunc(d.userAgent, 500),
          d.deviceInfo ? JSON.stringify(d.deviceInfo) : null,
          d.responseTimeMs, d.isSuspicious ? 1 : 0,
        ],
      );
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
      await this.db.query(
        `INSERT INTO auth_logs (request_id,user_id,email,role,action,ip_address,
          user_agent,device_info,failure_reason,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          d.requestId ?? null, d.userId ?? null, d.email ?? null, d.role ?? null,
          d.action, d.ipAddress, trunc(d.userAgent, 500),
          d.deviceInfo ? JSON.stringify(d.deviceInfo) : null,
          trunc(d.failureReason, 500),
          d.metadata ? JSON.stringify(sanitize(d.metadata)) : null,
        ],
      );
    } catch { /* never throw */ }
  }

  async logActivity(d: {
    requestId?: string; userId: number; role: string; action: string;
    entityType?: string; entityId?: number; description?: string;
    metadata?: any; ipAddress?: string;
  }) {
    try {
      await this.db.query(
        `INSERT INTO activity_logs (request_id,user_id,role,action,entity_type,
          entity_id,description,metadata,ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          d.requestId ?? null, d.userId, d.role, d.action,
          d.entityType ?? null, d.entityId ?? null, trunc(d.description, 500),
          d.metadata ? JSON.stringify(sanitize(d.metadata)) : null,
          d.ipAddress ?? null,
        ],
      );
    } catch { /* never throw */ }
  }

  async logError(d: {
    requestId?: string; userId?: number; ipAddress?: string;
    endpoint?: string; method?: string; statusCode?: number;
    errorType: string; errorMessage: string; stackTrace?: string; metadata?: any;
  }) {
    try {
      await this.db.query(
        `INSERT INTO error_logs (request_id,user_id,ip_address,endpoint,method,status_code,
          error_type,error_message,stack_trace,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          d.requestId ?? null, d.userId ?? null, d.ipAddress ?? null,
          trunc(d.endpoint, 500), d.method ?? null, d.statusCode ?? null,
          trunc(d.errorType, 100), trunc(d.errorMessage, 2000),
          process.env.APP_ENV !== 'production' ? trunc(d.stackTrace, 5000) : null,
          d.metadata ? JSON.stringify(sanitize(d.metadata)) : null,
        ],
      );
    } catch { /* never throw */ }
  }

  async logSecurityEvent(d: {
    eventType: string; severity: 'low'|'medium'|'high'|'critical';
    userId?: number; ipAddress: string; endpoint?: string;
    description: string; metadata?: any;
  }) {
    try {
      await this.db.query(
        `INSERT INTO security_events (event_type,severity,user_id,ip_address,endpoint,description,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          d.eventType, d.severity, d.userId ?? null, d.ipAddress,
          d.endpoint ?? null, trunc(d.description, 2000),
          d.metadata ? JSON.stringify(d.metadata) : null,
        ],
      );
    } catch { /* never throw */ }
  }

  async logAlert(d: {
    alertType: string; severity: 'info'|'warning'|'error'|'critical';
    title: string; message: string; metadata?: any; channels?: string[];
  }) {
    try {
      await this.db.query(
        `INSERT INTO alert_logs (alert_type,severity,title,message,metadata,notified_channels)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          d.alertType, d.severity, trunc(d.title, 255), trunc(d.message, 2000),
          d.metadata ? JSON.stringify(d.metadata) : null,
          JSON.stringify(d.channels ?? ['dashboard']),
        ],
      );
    } catch { /* never throw */ }
  }

  // ─── Blocked IP ──────────────────────────────────────────────────────────────

  async isBlockedIp(ip: string): Promise<boolean> {
    try {
      const [row] = await this.db.query(
        `SELECT id FROM blocked_ips WHERE ip_address = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [ip],
      );
      return !!row;
    } catch { return false; }
  }

  async blockIp(ip: string, reason: string, blockedBy: number, expiresAt?: Date) {
    await this.db.query(
      `INSERT INTO blocked_ips (ip_address,reason,blocked_by,expires_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (ip_address) DO UPDATE SET reason=$2, blocked_by=$3, expires_at=$4`,
      [ip, reason, blockedBy, expiresAt ?? null],
    );
  }

  async unblockIp(ip: string) {
    const result = await this.db.query('DELETE FROM blocked_ips WHERE ip_address = $1', [ip]);
    return (result[1] ?? 0) > 0; // TypeORM returns [rows, rowCount] for raw queries
  }

  // ─── Security Helpers ────────────────────────────────────────────────────────

  async recentFailedLogins(ip: string, minutes: number): Promise<number> {
    try {
      const [{ cnt }] = await this.db.query(
        `SELECT COUNT(*) as cnt FROM auth_logs
         WHERE ip_address=$1 AND action='login_failure'
         AND created_at >= NOW() - ($2 * INTERVAL '1 minute')`,
        [ip, minutes],
      );
      return +cnt;
    } catch { return 0; }
  }

  async recentRequestCount(ip: string, minutes: number): Promise<number> {
    try {
      const [{ cnt }] = await this.db.query(
        `SELECT COUNT(*) as cnt FROM api_logs
         WHERE ip_address=$1 AND created_at >= NOW() - ($2 * INTERVAL '1 minute')`,
        [ip, minutes],
      );
      return +cnt;
    } catch { return 0; }
  }

  async recentUnauthorizedCount(ip: string, minutes: number): Promise<number> {
    try {
      const [{ cnt }] = await this.db.query(
        `SELECT COUNT(*) as cnt FROM api_logs
         WHERE ip_address=$1 AND status_code IN (401,403)
         AND created_at >= NOW() - ($2 * INTERVAL '1 minute')`,
        [ip, minutes],
      );
      return +cnt;
    } catch { return 0; }
  }

  // ─── Dashboard APIs ──────────────────────────────────────────────────────────

  async getOverview() {
    const today = new Date().toISOString().slice(0, 10);
    const [
      [totalReq], [activeUsers], [failedLogins], [err4xx], [err5xx],
      [avgResp], topApis, topIps, [suspicious], [unreadAlerts],
      hourlyTrend, recentErrors,
    ] = await Promise.all([
      this.db.query(`SELECT COUNT(*) as cnt FROM api_logs WHERE created_at::date=$1`, [today]),
      this.db.query(`SELECT COUNT(DISTINCT user_id) as cnt FROM api_logs WHERE created_at::date=$1 AND user_id IS NOT NULL`, [today]),
      this.db.query(`SELECT COUNT(*) as cnt FROM auth_logs WHERE action='login_failure' AND created_at::date=$1`, [today]),
      this.db.query(`SELECT COUNT(*) as cnt FROM api_logs WHERE status_code BETWEEN 400 AND 499 AND created_at::date=$1`, [today]),
      this.db.query(`SELECT COUNT(*) as cnt FROM api_logs WHERE status_code>=500 AND created_at::date=$1`, [today]),
      this.db.query(`SELECT ROUND(AVG(response_time_ms)::numeric,0) as avg FROM api_logs WHERE created_at::date=$1`, [today]),
      this.db.query(`SELECT endpoint, COUNT(*) as count FROM api_logs WHERE created_at::date=$1 GROUP BY endpoint ORDER BY count DESC LIMIT 10`, [today]),
      this.db.query(`SELECT ip_address, COUNT(*) as count FROM api_logs WHERE created_at::date=$1 GROUP BY ip_address ORDER BY count DESC LIMIT 10`, [today]),
      this.db.query(`SELECT COUNT(*) as cnt FROM security_events WHERE is_resolved=false AND created_at::date=$1`, [today]),
      this.db.query(`SELECT COUNT(*) as cnt FROM alert_logs WHERE is_read=false`),
      this.db.query(`SELECT EXTRACT(HOUR FROM created_at) as hr, COUNT(*) as count FROM api_logs WHERE created_at::date=$1 GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hr`, [today]),
      this.db.query(`SELECT id,endpoint,method,status_code,error_message,created_at FROM error_logs ORDER BY created_at DESC LIMIT 5`),
    ]);

    return {
      today,
      total_requests: +totalReq.cnt,
      active_users: +activeUsers.cnt,
      failed_logins: +failedLogins.cnt,
      errors_4xx: +err4xx.cnt,
      errors_5xx: +err5xx.cnt,
      avg_response_ms: +(avgResp.avg ?? 0),
      top_apis: topApis,
      top_ips: topIps,
      suspicious_count: +suspicious.cnt,
      unread_alerts: +unreadAlerts.cnt,
      hourly_trend: hourlyTrend,
      recent_errors: recentErrors,
    };
  }

  async getApiLogs(q: any) {
    return this._paginate('api_logs', q, [
      ['from_date', 'created_at >= $?', (v: string) => v + ' 00:00:00'],
      ['to_date', 'created_at <= $?', (v: string) => v + ' 23:59:59'],
      ['user_id', 'user_id = $?', Number],
      ['role', 'role = $?'],
      ['ip_address', 'ip_address = $?'],
      ['endpoint', 'endpoint LIKE $?', (v: string) => `%${v}%`],
      ['status_code', 'status_code = $?', Number],
      ['errors_only', 'status_code >= 400', null, true],
      ['suspicious_only', 'is_suspicious = true', null, true],
      ['search', '(endpoint LIKE $? OR ip_address LIKE $? OR role LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`, `%${v}%`]],
    ]);
  }

  async getAuthLogs(q: any) {
    return this._paginate('auth_logs', q, [
      ['from_date', 'created_at >= $?', (v: string) => v + ' 00:00:00'],
      ['to_date', 'created_at <= $?', (v: string) => v + ' 23:59:59'],
      ['user_id', 'user_id = $?', Number],
      ['ip_address', 'ip_address = $?'],
      ['action', 'action = $?'],
      ['search', '(email LIKE $? OR ip_address LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`]],
    ]);
  }

  async getActivityLogs(q: any) {
    return this._paginate('activity_logs', q, [
      ['from_date', 'created_at >= $?', (v: string) => v + ' 00:00:00'],
      ['to_date', 'created_at <= $?', (v: string) => v + ' 23:59:59'],
      ['user_id', 'user_id = $?', Number],
      ['role', 'role = $?'],
      ['action', 'action LIKE $?', (v: string) => `%${v}%`],
      ['search', '(action LIKE $? OR description LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`]],
    ]);
  }

  async getErrorLogs(q: any) {
    return this._paginate('error_logs', q, [
      ['from_date', 'created_at >= $?', (v: string) => v + ' 00:00:00'],
      ['to_date', 'created_at <= $?', (v: string) => v + ' 23:59:59'],
      ['user_id', 'user_id = $?', Number],
      ['status_code', 'status_code = $?', Number],
      ['search', '(error_message LIKE $? OR endpoint LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`]],
    ]);
  }

  async getSecurityEvents(q: any) {
    return this._paginate('security_events', q, [
      ['from_date', 'created_at >= $?', (v: string) => v + ' 00:00:00'],
      ['to_date', 'created_at <= $?', (v: string) => v + ' 23:59:59'],
      ['ip_address', 'ip_address = $?'],
      ['severity', 'severity = $?'],
      ['search', '(description LIKE $? OR event_type LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`]],
    ]);
  }

  async getAlerts(q: any) {
    return this._paginate('alert_logs', q, [
      ['severity', 'severity = $?'],
      ['search', '(title LIKE $? OR message LIKE $?)', (v: string) => [`%${v}%`, `%${v}%`]],
    ]);
  }

  async markAlertRead(id: number) {
    await this.db.query('UPDATE alert_logs SET is_read=true WHERE id=$1', [id]);
    return { updated: true };
  }

  async getBlockedIps() {
    return this.db.query(
      `SELECT bi.*, u.name as blocked_by_name
       FROM blocked_ips bi LEFT JOIN users u ON bi.blocked_by=u.id
       ORDER BY bi.created_at DESC`,
    );
  }

  async resolveSecurityEvent(id: number, adminId: number) {
    const result = await this.db.query(
      'UPDATE security_events SET is_resolved=true, resolved_at=NOW(), resolved_by=$1 WHERE id=$2',
      [adminId, id],
    );
    return (result[1] ?? 0) > 0; // TypeORM returns [rows, rowCount] for raw queries
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
          return `"${s.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    return lines.join('\n');
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  private async _paginate(table: string, q: any, filters: any[]) {
    const { page = 1, per_page = 50 } = q;
    const where: string[] = [];
    const params: any[] = [];

    for (const [key, clauseTemplate, transform, flag] of filters) {
      const val = q[key];
      if (val === undefined || val === null || val === '' || val === false) continue;
      if (flag) {
        if (val === true || val === 'true') where.push(clauseTemplate as string);
        continue;
      }

      // Replace $? placeholders with actual numbered params
      const applyClause = (clause: string, values: any[]) => {
        let result = clause;
        for (const v of values) {
          params.push(v);
          result = result.replace('$?', `$${params.length}`);
        }
        where.push(result);
      };

      if (!transform) {
        applyClause(clauseTemplate as string, [val]);
      } else {
        const mapped = (transform as Function)(val);
        if (Array.isArray(mapped)) {
          applyClause(clauseTemplate as string, mapped);
        } else {
          applyClause(clauseTemplate as string, [mapped]);
        }
      }
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (+page - 1) * +per_page;

    const [{ total }] = await this.db.query(`SELECT COUNT(*) as total FROM ${table} ${whereStr}`, params);
    params.push(+per_page, offset);
    const data = await this.db.query(
      `SELECT * FROM ${table} ${whereStr} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: +total, page: +page, per_page: +per_page, data };
  }
}
