import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class FirestoreService {
  private sa: any = null;

  private getServiceAccount(): any {
    if (!this.sa) {
      const p = path.join(__dirname, '../../config/firebase-service-account.json');
      if (fs.existsSync(p)) this.sa = JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    return this.sa;
  }

  private b64url(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async getAccessToken(): Promise<string | null> {
    const sa = this.getServiceAccount();
    if (!sa?.project_id) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = this.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.b64url(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
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
        new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return resp.data.access_token ?? null;
    } catch { return null; }
  }

  async signal(collection: string, docId: string, meta: Record<string, any> = {}): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) return false;
    const sa = this.getServiceAccount();

    const fields: Record<string, any> = { updatedAt: { integerValue: String(Math.floor(Date.now() / 1000)) } };
    for (const [k, v] of Object.entries(meta)) {
      fields[k] = typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
    }

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/signals_${collection}/${docId}`;
      const resp = await axios.patch(url, { fields }, { headers: { Authorization: `Bearer ${token}` } });
      return !!resp.data?.name;
    } catch { return false; }
  }

  offerCreated(vendorId: number) {
    this.signal('feed', 'latest', { vendorId }).catch(() => {});
    this.signal('vendor_stats', String(vendorId), { vendorId }).catch(() => {});
  }

  offerChanged(vendorId: number) {
    this.signal('feed', 'latest', { vendorId }).catch(() => {});
    this.signal('vendor_stats', String(vendorId), { vendorId }).catch(() => {});
  }

  interactionLogged(vendorId: number) {
    this.signal('vendor_stats', String(vendorId), { vendorId }).catch(() => {});
  }

  notificationSent(userId: number) {
    this.signal('notifications', String(userId), { userId }).catch(() => {});
  }
}
