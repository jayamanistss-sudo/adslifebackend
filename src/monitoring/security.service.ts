import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from './monitoring.service';
import axios from 'axios';

const SUSPICIOUS_UAS = [
  'sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'dirbuster', 'gobuster',
  'burpsuite', 'hydra', 'wfuzz', 'nuclei', 'acunetix', 'nessus', 'metasploit',
  'python-requests', 'go-http-client', 'curl/', 'wget/',
];

@Injectable()
export class SecurityService {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly config: ConfigService,
  ) {}

  isSuspiciousUserAgent(ua: string): boolean {
    if (!ua) return false;
    const lower = ua.toLowerCase();
    return SUSPICIOUS_UAS.some(s => lower.includes(s));
  }

  analyzeAfterAuthFailure(ip: string, userId?: number) {
    setImmediate(async () => {
      try {
        const count = await this.monitoring.recentFailedLogins(ip, 10);
        if (count < 5) return;

        const severity = count >= 15 ? 'critical' : count >= 10 ? 'high' : 'medium';

        // Deduplicate: only log security event when count is exactly 5, 10, or 15
        if (count === 5 || count === 10 || count === 15) {
          await this.monitoring.logSecurityEvent({
            eventType: 'brute_force_detected', severity,
            userId, ipAddress: ip,
            description: `${count} failed login attempts from IP ${ip} in 10 minutes`,
            metadata: { fail_count: count, window_minutes: 10 },
          });
          await this.monitoring.logAlert({
            alertType: 'brute_force',
            severity: severity === 'critical' ? 'critical' : 'error',
            title: 'Brute Force Attack Detected',
            message: `IP ${ip} has ${count} failed login attempts in 10 minutes`,
            metadata: { ip, fail_count: count },
          });
          await this.sendWebhookAlert('Brute Force Attack', `IP ${ip} — ${count} failed logins in 10min`, severity);
        }
      } catch { /* never throw */ }
    });
  }

  analyzeRequestRate(ip: string, endpoint: string) {
    setImmediate(async () => {
      try {
        const count = await this.monitoring.recentRequestCount(ip, 1);
        if (count !== 100 && count !== 200 && count !== 500) return;

        const severity = count >= 500 ? 'critical' : count >= 200 ? 'high' : 'medium';
        await this.monitoring.logSecurityEvent({
          eventType: 'rate_limit_exceeded', severity,
          ipAddress: ip, endpoint,
          description: `IP ${ip} made ${count} requests in 1 minute`,
          metadata: { request_count: count },
        });
        await this.monitoring.logAlert({
          alertType: 'rate_abuse',
          severity: severity === 'critical' ? 'critical' : 'warning',
          title: 'Excessive Request Rate',
          message: `IP ${ip} — ${count} req/min on ${endpoint}`,
          metadata: { ip, count, endpoint },
        });
        await this.sendWebhookAlert('Rate Abuse', `IP ${ip} — ${count} req/min`, severity);
      } catch { /* never throw */ }
    });
  }

  analyzeUnauthorized(ip: string, endpoint: string, statusCode: number, userId?: number) {
    setImmediate(async () => {
      try {
        const count = await this.monitoring.recentUnauthorizedCount(ip, 5);
        if (count !== 10 && count !== 25) return;

        await this.monitoring.logSecurityEvent({
          eventType: 'repeated_unauthorized', severity: 'medium',
          userId, ipAddress: ip, endpoint,
          description: `IP ${ip} has ${count} unauthorized (${statusCode}) responses in 5 minutes`,
          metadata: { count, status_code: statusCode },
        });
      } catch { /* never throw */ }
    });
  }

  private async sendWebhookAlert(title: string, message: string, severity: string) {
    const url = this.config.get<string>('monitoring.webhookUrl');
    if (!url) return;
    try {
      await axios.post(url, {
        text: `🚨 [${severity.toUpperCase()}] *${title}*\n${message}`,
        attachments: [{ color: severity === 'critical' ? '#ff0000' : '#ff9900', text: message }],
      }, { timeout: 5000 });
    } catch { /* webhook failure is non-critical */ }
  }
}
