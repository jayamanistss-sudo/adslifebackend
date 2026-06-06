import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReferralService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ADS';
    for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async ensureCode(userId: number): Promise<string> {
    const [user] = await this.db.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
    if (user?.referral_code) return user.referral_code;
    let code: string;
    let attempts = 0;
    do {
      code = this.generateCode();
      const [existing] = await this.db.query('SELECT id FROM users WHERE referral_code = $1', [code]);
      if (!existing) break;
    } while (++attempts < 10);
    await this.db.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, userId]);
    return code;
  }

  async getMyReferral(userId: number) {
    const code = await this.ensureCode(userId);
    const [{ coins }] = await this.db.query('SELECT coins FROM users WHERE id = $1', [userId]);
    const [{ count }] = await this.db.query(
      'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1', [userId],
    );
    return { referral_code: code, coins: +coins, referral_count: +count };
  }

  async applyReferral(referredUserId: number, code: string) {
    const [referrer] = await this.db.query(
      'SELECT id FROM users WHERE referral_code = $1 AND id != $2', [code, referredUserId],
    );
    if (!referrer) return;
    const [already] = await this.db.query(
      'SELECT id FROM referrals WHERE referred_id = $1', [referredUserId],
    );
    if (already) return;
    await this.db.transaction(async (manager) => {
      await manager.query(
        'INSERT INTO referrals (referrer_id, referred_id, coins_awarded) VALUES ($1, $2, 50)',
        [referrer.id, referredUserId],
      );
      await manager.query('UPDATE users SET coins = coins + 50 WHERE id = $1', [referrer.id]);
      await manager.query('UPDATE users SET coins = coins + 20 WHERE id = $1', [referredUserId]);
    });
  }
}
