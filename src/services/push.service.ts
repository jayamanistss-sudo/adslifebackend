import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import axios from 'axios';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { User } from '../entities/user.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox, NotificationOutboxStatus } from '../entities/notification-outbox.entity';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { NotificationsGateway } from '../gateway/notifications.gateway';

interface PushResult {
  sent: number;
  /** true if the push leg failed in a way worth retrying later (OAuth/network/FCM-side error) */
  shouldRetry: boolean;
  error?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(UserFcmToken) private readonly userFcmTokenRepo: Repository<UserFcmToken>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(NotificationOutbox) private readonly outboxRepo: Repository<NotificationOutbox>,
    private readonly settings: NotificationSettingsService,
    private readonly gateway: NotificationsGateway,
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

  /**
   * Sends an in-app notification (always) and attempts FCM push (best-effort).
   * If the FCM leg fails for transient reasons (OAuth/network/FCM-side error),
   * the (user, title, body) is queued in notification_outbox for retry by
   * PushOutboxService's cron — the in-app notification is never re-queued,
   * since the DB insert above already succeeded.
   */
  async send(
    userIds: number | number[], title: string, body: string,
    data: Record<string, string> = {}, createdBy: number | null = null,
  ): Promise<number> {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (!ids.length) return 0;

    const type = data.type ?? 'push';
    const [inAppOn, pushOn] = await Promise.all([
      this.settings.isEnabled(type, 'in_app'),
      this.settings.isEnabled(type, 'push'),
    ]);

    // The in-app notification (bell icon / notifications list) must not
    // depend on FCM succeeding — users without a registered push token, or
    // any time the FCM/OAuth pipeline is down, should still see it in-app.
    if (inAppOn) {
      const offerId = data.offer_id ? +data.offer_id : null;
      await this.notifRepo.insert(
        ids.map((uid) => ({
          user_id: uid,
          title,
          body,
          type,
          offer_id: offerId,
          is_read: false,
        })),
      );

      // Realtime — the live counterpart of the in-app row, for users
      // currently connected via Socket.IO. Every notification type gets
      // this now (previously only wired for new-offer-to-followers).
      this.gateway.sendToUsers(ids, 'notification', {
        type, title, body, ...data, created_at: new Date().toISOString(),
      });
    }

    if (!pushOn) return 0;

    // Per-user opt-out (mobile/web Settings "Push Notifications" toggle).
    // Only the FCM leg is gated — the in-app row/socket event above already
    // went out regardless, matching how the admin-level pushOn/inAppOn
    // toggles are already independent of each other.
    const optedIn = await this.userRepo.find({
      where: { id: In(ids), push_enabled: true },
      select: ['id'],
    });
    const optedInIds = optedIn.map((u) => u.id);
    if (!optedInIds.length) return 0;

    const result = await this.pushOnly(optedInIds, title, body, data);

    if (result.shouldRetry) {
      await this.enqueueOutbox(optedInIds, title, body, data, createdBy, result.error);
    }

    return result.sent;
  }

  /**
   * FCM-only send (no in-app notification insert) — used both by send() above
   * and by PushOutboxService when retrying a previously-failed push.
   */
  async pushOnly(userIds: number[], title: string, body: string, data: Record<string, string> = {}): Promise<PushResult> {
    const sa = this.getServiceAccount();
    if (!sa?.project_id) {
      this.logger.warn('pushOnly(): no firebase-service-account.json found, skipping FCM push');
      return { sent: 0, shouldRetry: false }; // missing config isn't a transient failure — retrying won't help
    }

    const accessToken = await this.getAccessToken(sa);
    if (!accessToken) {
      return { sent: 0, shouldRetry: true, error: 'Could not obtain FCM access token (OAuth exchange failed)' };
    }

    const tokens = await this.userFcmTokenRepo.find({ where: { user_id: In(userIds) } });
    if (!tokens.length) return { sent: 0, shouldRetry: false }; // no device registered — nothing to retry

    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const CONCURRENCY = 20;
    let sent = 0;
    const stale: string[] = [];
    const errors: string[] = [];

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
        // UNREGISTERED = token rotated/app uninstalled; INVALID_ARGUMENT here
        // means the token field itself is malformed (every other field in
        // this request is identical across the loop) — both mean this
        // specific token will never work again, so purge either way instead
        // of leaving a dead token to fail forever on every future send.
        const code = e.response?.data?.error?.details?.find((d: any) => d.errorCode)?.errorCode;
        if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') {
          stale.push(token);
        } else {
          const msg = JSON.stringify(e.response?.data ?? e.message);
          this.logger.warn(`FCM send failed for token ending …${token.slice(-8)}: ${msg}`);
          errors.push(msg);
        }
      }
    };

    for (let i = 0; i < tokens.length; i += CONCURRENCY) {
      await Promise.all(tokens.slice(i, i + CONCURRENCY).map(({ token }: { token: string }) => sendOne(token)));
    }

    if (stale.length) {
      await this.userFcmTokenRepo.delete({ token: In(stale) });
    }

    // Retry only if every live token failed and none succeeded — a partial
    // success (some tokens delivered) isn't worth re-sending duplicates for.
    const shouldRetry = sent === 0 && errors.length > 0;
    return { sent, shouldRetry, error: errors[0] };
  }

  private async enqueueOutbox(
    userIds: number[], title: string, body: string, data: Record<string, string>,
    createdBy: number | null, lastError?: string,
  ): Promise<void> {
    await this.outboxRepo.insert(
      userIds.map((uid) => ({
        user_id: uid,
        title,
        body,
        type: data.type ?? 'push',
        data,
        status: NotificationOutboxStatus.PENDING,
        attempts: 0,
        last_error: lastError ?? null,
        is_active: true,
        created_by: createdBy,
        updated_by: createdBy,
      })),
    );
  }
}
