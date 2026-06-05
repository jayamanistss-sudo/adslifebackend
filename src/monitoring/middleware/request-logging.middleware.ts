import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { MonitoringService } from '../monitoring.service';
import { SecurityService } from '../security.service';

const SKIP_PREFIXES = ['/uploads/', '/docs', '/favicon', '/monitoring'];
const SKIP_METHODS = new Set(['OPTIONS']);

function shouldSkip(url: string, method: string): boolean {
  if (SKIP_METHODS.has(method)) return true;
  if (url === '/' || url === '/health') return true;
  return SKIP_PREFIXES.some(p => url.startsWith(p));
}

function getIp(req: Request): string {
  const fwd = req.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.get('x-real-ip') ?? req.socket?.remoteAddress ?? req.ip ?? '0.0.0.0';
}

function parseDevice(ua: string): any {
  if (!ua) return null;
  const l = ua.toLowerCase();
  let browser = 'Unknown';
  if (/firefox/i.test(l)) browser = 'Firefox';
  else if (/edg/i.test(l)) browser = 'Edge';
  else if (/chrome/i.test(l)) browser = 'Chrome';
  else if (/safari/i.test(l)) browser = 'Safari';
  else if (/postman/i.test(l)) browser = 'Postman';
  let os = 'Unknown';
  if (/windows/i.test(l)) os = 'Windows';
  else if (/android/i.test(l)) os = 'Android';
  else if (/iphone|ipad/i.test(l)) os = 'iOS';
  else if (/mac os/i.test(l)) os = 'macOS';
  else if (/linux/i.test(l)) os = 'Linux';
  return {
    browser, os,
    mobile: /mobile|android|iphone|ipad/i.test(l),
    bot: /bot|crawl|spider/i.test(l),
  };
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly security: SecurityService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = getIp(req);
    const url = req.originalUrl ?? req.url;
    const method = req.method;

    // Block IP check
    const blocked = await this.monitoring.isBlockedIp(ip);
    if (blocked) {
      return res.status(403).json({ success: false, error: 'Your IP has been blocked', code: 403 });
    }

    // Attach request ID
    const requestId = (crypto as any).randomUUID?.() ??
      (Date.now().toString(36) + Math.random().toString(36).slice(2));
    (req as any).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    if (shouldSkip(url, method)) return next();

    const start = Date.now();
    const ua = req.get('user-agent') ?? '';
    const reqBody = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : undefined;

    // Capture response body by intercepting write/end
    const chunks: Buffer[] = [];
    const origWrite = (res as any).write.bind(res);
    const origEnd = (res as any).end.bind(res);

    (res as any).write = (chunk: any, ...args: any[]) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return origWrite(chunk, ...args);
    };

    (res as any).end = (chunk: any, ...args: any[]) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const ms = Date.now() - start;
      const statusCode = res.statusCode;
      const user = (req as any).user as any;
      const isSuspiciousUA = this.security.isSuspiciousUserAgent(ua);
      const isSuspicious = isSuspiciousUA || statusCode === 403;

      setImmediate(async () => {
        try {
          let responseBody: any = null;
          if (statusCode >= 400) {
            try { responseBody = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* non-JSON */ }
          }

          await this.monitoring.logRequest({
            requestId, userId: user?.user_id, role: user?.role,
            ipAddress: ip, method, endpoint: url, statusCode,
            requestBody: reqBody,
            responseBody,
            userAgent: ua,
            deviceInfo: parseDevice(ua),
            responseTimeMs: ms,
            isSuspicious,
          });

          // 500 alert
          if (statusCode >= 500) {
            await this.monitoring.logAlert({
              alertType: '500_error', severity: 'error',
              title: '500 Internal Server Error',
              message: `${method} ${url} → 500 from IP ${ip}`,
              metadata: { requestId, ip, endpoint: url, method, userId: user?.user_id },
            });
          }

          // Suspicious UA security event
          if (isSuspiciousUA) {
            await this.monitoring.logSecurityEvent({
              eventType: 'suspicious_user_agent', severity: 'medium',
              userId: user?.user_id, ipAddress: ip, endpoint: url,
              description: `Suspicious user-agent detected: ${ua.slice(0, 100)}`,
              metadata: { ua },
            });
          }

          this.security.analyzeRequestRate(ip, url);
          if (statusCode === 401 || statusCode === 403) {
            this.security.analyzeUnauthorized(ip, url, statusCode, user?.user_id);
          }
        } catch { /* never throw */ }
      });

      return origEnd(chunk, ...args);
    };

    next();
  }
}
