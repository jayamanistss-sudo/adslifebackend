import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import axios from 'axios';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(UserFcmToken) private readonly userFcmTokenRepo: Repository<UserFcmToken>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  private getServiceAccount(): any {
    const p = path.join(__dirname, '../../config/firebase-service-account.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }

  private b64url(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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
    const jwtToken = `${data}.${sig}`;

    try {
      const resp = await axios.post('https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwtToken,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return resp.data.access_token ?? null;
    } catch (e: any) {
      this.logger.warn(`OAuth token exchange failed: ${JSON.stringify(e.response?.data ?? e.message)}`);
      return null;
    }
  }

  async send(userIds: number | number[], title: string, body: string, data: Record<string, string> = {}): Promise<number> {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return 0;

    // The in-app notification (bell icon / notifications list) must not
    // depend on FCM succeeding — users without a registered push token, or
    // any time the FCM/OAuth pipeline is down, should still see it in-app.
    const offerId = data.offer_id ? +data.offer_id : null;
    await this.notifRepo.insert(
      ids.map((uid) => ({
        user_id: uid,
        title,
        body,
        type: data.type ?? 'push',
        offer_id: offerId,
        is_read: false,
      })),
    );

    const sa = this.getServiceAccount();
    if (!sa?.project_id) {
      this.logger.warn('send(): no firebase-service-account.json found, skipping FCM push');
      return 0;
    }

    const accessToken = await this.getAccessToken(sa);
    if (!accessToken) {
      this.logger.warn('send(): could not obtain FCM access token, skipping FCM push');
      return 0;
    }

    const tokens = await this.userFcmTokenRepo.find({ where: { user_id: In(ids) } });
    if (!tokens.length) return 0;

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

        if (resp.data?.name) sent++;
      } catch (e: any) {
        if (e.response?.data?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
          stale.push(token);
        } else {
          this.logger.warn(`FCM send failed for token ending …${token.slice(-8)}: ${JSON.stringify(e.response?.data ?? e.message)}`);
        }
      }
    };

    for (let i = 0; i < tokens.length; i += CONCURRENCY) {
      await Promise.all(tokens.slice(i, i + CONCURRENCY).map(({ token }: { token: string }) => sendOne(token)));
    }

    if (stale.length) {
      await this.userFcmTokenRepo.delete({ token: In(stale) });
    }

    return sent;
  }
}
