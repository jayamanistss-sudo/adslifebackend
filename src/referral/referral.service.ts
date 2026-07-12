import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Referral } from '../entities/referral.entity';
import { User } from '../entities/user.entity';
import { SiteSetting } from '../entities/site-setting.entity';

const DEFAULT_REFERRER_REWARD = 50;
const DEFAULT_REFERRED_REWARD = 20;

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Previously hardcoded literals — an admin had no way to tune referral
  // rewards without a code deploy.
  private async getRewardAmounts(): Promise<{ referrer: number; referred: number }> {
    const rows = await this.settingRepo.find({
      where: [{ key: 'referral_reward_referrer' }, { key: 'referral_reward_referred' }],
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const referrer = Number(map.referral_reward_referrer) || DEFAULT_REFERRER_REWARD;
    const referred = Number(map.referral_reward_referred) || DEFAULT_REFERRED_REWARD;
    return { referrer, referred };
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ADS';
    for (let i = 0; i < 7; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async ensureCode(userId: number): Promise<string> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'referral_code'] });
    if (user?.referral_code) return user.referral_code;
    let code: string;
    let attempts = 0;
    do {
      code = this.generateCode();
      const existing = await this.userRepo.count({ where: { referral_code: code } });
      if (!existing) break;
    } while (++attempts < 10);
    await this.userRepo.update(userId, { referral_code: code });
    return code;
  }

  async getMyReferral(userId: number) {
    const code = await this.ensureCode(userId);
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['coins'] });
    const count = await this.referralRepo.count({ where: { referrer_id: userId } });
    // Previously only a bare count was returned — no way to actually see
    // who you referred, just a number. Joins in the referred user's name
    // (not email/phone — this is shown back to the referrer, not an admin).
    const referred = await this.referralRepo
      .createQueryBuilder('r')
      .innerJoin(User, 'u', 'u.id = r.referred_id')
      .select(['u.name AS name', 'r.coins_awarded AS coins_awarded', 'r.created_at AS joined_at'])
      .where('r.referrer_id = :userId', { userId })
      .orderBy('r.created_at', 'DESC')
      .limit(50)
      .getRawMany();
    return { referral_code: code, coins: +(user?.coins ?? 0), referral_count: count, referred };
  }

  async applyReferral(referredUserId: number, code: string) {
    const referrer = await this.userRepo.findOne({
      where: { referral_code: code, id: Not(referredUserId) },
      select: ['id'],
    });
    if (!referrer) return;
    const already = await this.referralRepo.findOne({ where: { referred_id: referredUserId } });
    if (already) return;
    const { referrer: referrerReward, referred: referredReward } = await this.getRewardAmounts();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Referral).save({
        referrer_id: referrer.id,
        referred_id: referredUserId,
        coins_awarded: referrerReward,
      });
      await manager.getRepository(User).increment({ id: referrer.id }, 'coins', referrerReward);
      await manager.getRepository(User).increment({ id: referredUserId }, 'coins', referredReward);
    });
  }
}
