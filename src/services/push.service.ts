import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class PushService {
  constructor(@InjectDataSource() private db: DataSource) {}

  private getServiceAccount(): any {
    const p = path.join(__dirname, '../../config/firebase-service-account.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }

  private b64url(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async getAccessToken(sa: any): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    const header = this.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    }));
    const data = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    const sig = this.b64url(sign.sign(sa.private_key));
    const jwt = `${data}.${sig}`;

    try {
      const resp = await axios.post('https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return resp.data.access_token ?? null;
    } catch { return null; }
  }

  async send(userIds: number | number[], title: string, body: string, data: Record<string, string> = {}): Promise<number> {
    const sa = this.getServiceAccount();
    if (!sa?.project_id) return 0;

    const accessToken = await this.getAccessToken(sa);
    if (!accessToken) return 0;

    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const tokens = await this.db.query(
      `SELECT token, user_id FROM user_fcm_tokens WHERE user_id IN (${placeholders})`,
      ids,
    );
    if (!tokens.length) return 0;

    const tokenMap: Record<string, number> = {};
    for (const t of tokens) tokenMap[t.token] = t.user_id;

    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const CONCURRENCY = 20;
    let sent = 0;
    const stale: string[] = [];

    const sendOne = async (token: string) => {
      try {
        const resp = await axios.post(url, {
          message: {
            token,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
            android: { notification: { icon: 'ic_notification', color: '#FF6200' } },
            webpush: { notification: { icon: '/favicon.svg', badge: '/favicon.svg' } },
          },
        }, { headers: { Authorization: `Bearer ${accessToken}` } });

        if (resp.data?.name) {
          sent++;
          const uid = tokenMap[token];
          const offerId = data.offer_id ? +data.offer_id : null;
          if (uid) {
            await this.db.query(
              'INSERT INTO notifications (user_id, title, body, type, offer_id, is_read) VALUES (?, ?, ?, ?, ?, 0)',
              [uid, title, body, data.type ?? 'push', offerId],
            );
          }
        }
      } catch (e: any) {
        if (e.response?.data?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
          stale.push(token);
        }
      }
    };

    // Process in parallel batches capped at CONCURRENCY
    for (let i = 0; i < tokens.length; i += CONCURRENCY) {
      await Promise.all(tokens.slice(i, i + CONCURRENCY).map(({ token }: { token: string }) => sendOne(token)));
    }

    if (stale.length) {
      const pl = stale.map(() => '?').join(',');
      await this.db.query(`DELETE FROM user_fcm_tokens WHERE token IN (${pl})`, stale);
    }

    return sent;
  }
}
