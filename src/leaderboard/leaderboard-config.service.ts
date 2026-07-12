import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../entities/site-setting.entity';

// Score weights were hardcoded literals inline in the SQL (×10/×30/×5/×2) —
// no admin lever to retune without a deploy. Defaults match the exact
// pre-existing values.
export interface LeaderboardWeights {
  save_points: number;
  redeem_points: number;
  share_points: number;
  view_click_direction_points: number;
}

export const DEFAULT_LEADERBOARD_WEIGHTS: LeaderboardWeights = {
  save_points: 10,
  redeem_points: 30,
  share_points: 5,
  view_click_direction_points: 2,
};

const SETTING_KEY = 'leaderboard_weights';

@Injectable()
export class LeaderboardConfigService {
  private cache: LeaderboardWeights | null = null;
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  async getWeights(): Promise<LeaderboardWeights> {
    if (this.cache && Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS) return this.cache;
    const row = await this.settingRepo.findOne({ where: { key: SETTING_KEY } });
    let stored: Partial<LeaderboardWeights> = {};
    if (row?.value) {
      try { stored = JSON.parse(row.value); } catch { stored = {}; }
    }
    this.cache = { ...DEFAULT_LEADERBOARD_WEIGHTS, ...stored };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  async setWeights(patch: Partial<LeaderboardWeights>): Promise<LeaderboardWeights> {
    // Weights are string-interpolated into a raw SQL expression (scoreExpr
    // in leaderboard.controller.ts) — reject anything that isn't a small
    // finite integer before it ever reaches the query builder.
    for (const [key, val] of Object.entries(patch)) {
      if (!Number.isInteger(val) || (val as number) < 0 || (val as number) > 1000) {
        throw new BadRequestException(`${key} must be an integer between 0 and 1000`);
      }
    }
    const current = await this.getWeights();
    const merged = { ...current, ...patch };
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(merged) }, ['key']);
    this.cache = merged;
    this.cacheLoadedAt = Date.now();
    return merged;
  }

  async resetToDefaults(): Promise<LeaderboardWeights> {
    await this.settingRepo.upsert({ key: SETTING_KEY, value: JSON.stringify(DEFAULT_LEADERBOARD_WEIGHTS) }, ['key']);
    this.cache = { ...DEFAULT_LEADERBOARD_WEIGHTS };
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }
}
