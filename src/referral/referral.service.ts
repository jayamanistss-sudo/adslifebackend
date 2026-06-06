import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Referral } from '../entities/referral.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

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
    return { referral_code: code, coins: +(user?.coins ?? 0), referral_count: count };
  }

  async applyReferral(referredUserId: number, code: string) {
    const referrer = await this.userRepo.findOne({
      where: { referral_code: code, id: Not(referredUserId) },
      select: ['id'],
    });
    if (!referrer) return;
    const already = await this.referralRepo.findOne({ where: { referred_id: referredUserId } });
    if (already) return;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Referral).save({
        referrer_id: referrer.id,
        referred_id: referredUserId,
        coins_awarded: 50,
      });
      await manager.getRepository(User).increment({ id: referrer.id }, 'coins', 50);
      await manager.getRepository(User).increment({ id: referredUserId }, 'coins', 20);
    });
  }
}
