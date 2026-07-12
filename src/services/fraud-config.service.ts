import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../entities/site-setting.entity';

// Every rule weight and both score thresholds were hardcoded constants —
// no admin lever to tune fraud sensitivity without a code deploy. Defaults
// below match the exact pre-existing values.
export interface FraudConfig {
  duplicate_business_name: number;
  suspicious_discount: number;
  no_website_no_gst: number;
  bulk_offer_creation: number;
  copied_description: number;
  invalid_phone_pattern: number;
  missing_location_data: number;
  newly_registered_bulk_post: number;
  auto_reject_threshold: number;
  flag_review_threshold: number;
}

export const DEFAULT_FRAUD_CONFIG: FraudConfig = {
  duplicate_business_name: 25,
  suspicious_discount: 20,
  no_website_no_gst: 15,
  bulk_offer_creation: 20,
  copied_description: 25,
  invalid_phone_pattern: 15,
  missing_location_data: 10,
  newly_registered_bulk_post: 20,
  auto_reject_threshold: 85,
  flag_review_threshold: 60,
};

const SETTING_KEY = 'fraud_config';

@Injectable()
export class FraudConfigService {
  private cache: FraudConfig | null = null;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  async getConfig(): Promise<FraudConfig> {
    if (this.cache && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return this.cache;
    const row = await this.settingRepo.findOne({ where: { key: SETTING_KEY } });
    let stored: Partial<FraudConfig> = {};
    if (row?.value) {
      try { stored = JSON.parse(row.value); } catch { stored = {}; }
    }
    this.cache = { ...DEFAULT_FRAUD_CONFIG, ...stored };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  async setConfig(patch: Partial<FraudConfig>): Promise<FraudConfig> {
    // Same request-body shape (untyped Record<string,number>, bypasses
    // Nest's ValidationPipe) as feed-config.service.ts's setWeights, which
    // was found to accept arbitrary values all the way into a raw-SQL
    // string interpolation. These scores don't reach SQL, only JS
    // arithmetic in fraud-detector.service.ts, but reject non-numeric/
    // out-of-range input here too for the same reason: nothing else does.
    for (const [key, val] of Object.entries(patch)) {
      if (!Number.isInteger(val) || (val as number) < 0 || (val as number) > 1000) {
        throw new BadRequestException(`${key} must be an integer between 0 and 1000`);
      }
    }
    const current = await this.getConfig();
    const merged = { ...current, ...patch };
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(merged) }, ['key']);
    this.cache = merged;
    this.cacheLoadedAt = Date.now();
    return merged;
  }

  async resetToDefaults(): Promise<FraudConfig> {
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(DEFAULT_FRAUD_CONFIG) }, ['key']);
    this.cache = { ...DEFAULT_FRAUD_CONFIG };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }
}
