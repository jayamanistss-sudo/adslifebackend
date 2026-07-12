import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronTime } from 'cron';
import { SiteSetting } from '../entities/site-setting.entity';

// Campaign send times were hardcoded cron literals in the class body — no
// admin lever to retune without a code deploy. Defaults below match the
// exact pre-existing schedule (all IST / Asia/Kolkata, per the crons that
// register these).
export interface PromoSchedule {
  morning: string;
  lunch: string;
  evening: string;
  dinner: string;
  goodnight: string;
  weekend: string;
  reengage: string;
}

export const DEFAULT_PROMO_SCHEDULE: PromoSchedule = {
  morning: '0 7 * * *',
  lunch: '30 12 * * *',
  evening: '0 18 * * *',
  dinner: '0 21 * * *',
  goodnight: '0 23 * * *',
  weekend: '0 10 * * 6,0',
  reengage: '0 11 * * 2',
};

const SETTING_KEY = 'promo_notification_schedule';

@Injectable()
export class PromoScheduleConfigService {
  private cache: PromoSchedule | null = null;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  async getSchedule(): Promise<PromoSchedule> {
    if (this.cache && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return this.cache;
    const row = await this.settingRepo.findOne({ where: { key: SETTING_KEY } });
    let stored: Partial<PromoSchedule> = {};
    if (row?.value) {
      try { stored = JSON.parse(row.value); } catch { stored = {}; }
    }
    this.cache = { ...DEFAULT_PROMO_SCHEDULE, ...stored };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  async setSchedule(patch: Partial<PromoSchedule>): Promise<PromoSchedule> {
    for (const [key, val] of Object.entries(patch)) {
      const result = CronTime.validateCronExpression(val as string);
      if (!result.valid) {
        throw new BadRequestException(`${key}: "${val}" is not a valid cron expression`);
      }
    }
    const current = await this.getSchedule();
    const merged = { ...current, ...patch };
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(merged) }, ['key']);
    this.cache = merged;
    this.cacheLoadedAt = Date.now();
    return merged;
  }

  async resetToDefaults(): Promise<PromoSchedule> {
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(DEFAULT_PROMO_SCHEDULE) }, ['key']);
    this.cache = { ...DEFAULT_PROMO_SCHEDULE };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }
}
