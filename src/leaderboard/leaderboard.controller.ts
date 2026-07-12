import { Controller, Get, Put, Param, ParseIntPipe, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Leaderboard } from '../entities/leaderboard.entity';
import { User } from '../entities/user.entity';
import { MonitoringService } from '../monitoring/monitoring.service';
import { LeaderboardQueryDto } from './dto/leaderboard.dto';
import { LeaderboardConfigService, LeaderboardWeights } from './leaderboard-config.service';

// Score: save/redeem/share/view-click-direction weights, now admin-tunable
// via LeaderboardConfigService. Previously duplicated verbatim as hardcoded
// literals in both index() and myRank() — a real drift risk since they were
// copy-pasted, not shared. Now built from one weights-aware helper.
function scoreExpr(w: LeaderboardWeights): string {
  return `
  (SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END) * ${w.save_points} +
   SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END) * ${w.redeem_points} +
   SUM(CASE WHEN ui.action = 'share'  THEN 1 ELSE 0 END) * ${w.share_points} +
   SUM(CASE WHEN ui.action IN ('view','click','direction') THEN 1 ELSE 0 END) * ${w.view_click_direction_points})::int`;
}

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    @InjectRepository(Leaderboard) private readonly leaderboardRepo: Repository<Leaderboard>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly monitoring: MonitoringService,
    private readonly leaderboardConfig: LeaderboardConfigService,
  ) {}

  private buildConditions(period: string, city?: string | null): { conditions: string[]; params: any[] } {
    const conditions = [`ui.action != 'search'`, `u.excluded_from_leaderboard = false`];
    const params: any[] = [];
    if (period === 'weekly') conditions.push(`ui.created_at >= NOW() - INTERVAL '7 days'`);
    else if (period === 'monthly') conditions.push(`ui.created_at >= NOW() - INTERVAL '30 days'`);
    if (city) {
      params.push(city);
      conditions.push(`LOWER(u.city) = LOWER($${params.length})`);
    }
    return { conditions, params };
  }

  @Public()
  @Get()
  async index(@Query() query: LeaderboardQueryDto) {
    const period = query.period ?? 'monthly';
    const limit = Math.min(query.limit ?? 50, 100);
    const { conditions, params } = this.buildConditions(period, query.city);
    params.push(limit);
    const w = await this.leaderboardConfig.getWeights();

    const rows = await this.leaderboardRepo.manager.query(
      `SELECT u.id AS user_id, u.name, u.avatar_url, COALESCE(u.city, '') AS city,
              SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END)::int AS total_saves,
              SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END)::int AS total_redemptions,
              ${scoreExpr(w)} AS score
       FROM user_interactions ui
       JOIN users u ON u.id = ui.user_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.name, u.avatar_url, u.city
       ORDER BY score DESC
       LIMIT $${params.length}`,
      params,
    );

    const data = rows
      .filter((r: any) => r.score > 0)
      .map((r: any, i: number) => ({ ...r, period, rank: i + 1 }));
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async myRank(@Query() query: LeaderboardQueryDto, @CurrentUser() user: any) {
    const period = query.period ?? 'monthly';

    const me = await this.leaderboardRepo.manager.query(
      `SELECT city FROM users WHERE id = $1`, [user.user_id]);
    const city: string | null = me[0]?.city ?? null;
    const { conditions, params } = this.buildConditions(period, city);
    const w = await this.leaderboardConfig.getWeights();

    const rows = await this.leaderboardRepo.manager.query(
      `SELECT u.id AS user_id,
              SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END)::int AS total_saves,
              SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END)::int AS total_redemptions,
              ${scoreExpr(w)} AS score
       FROM user_interactions ui
       JOIN users u ON u.id = ui.user_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id
       ORDER BY score DESC`,
      params,
    );

    const ranked = rows.filter((r: any) => r.score > 0);
    const idx = ranked.findIndex((r: any) => r.user_id === user.user_id);
    const mine = idx >= 0 ? ranked[idx] : null;
    return {
      success: true,
      data: {
        period,
        city,
        score: mine?.score ?? 0,
        rank: idx >= 0 ? idx + 1 : null,
        total_saves: mine?.total_saves ?? 0,
        total_redemptions: mine?.total_redemptions ?? 0,
        total_ranked: ranked.length,
      },
    };
  }

  // Previously "rebuild" wrote into the `leaderboard` table using a
  // completely different, simpler formula (just counting saved_offers) than
  // what index()/myRank() actually read (computed live from
  // user_interactions) — even a hidden "fix" button wouldn't have fixed
  // anything, since nothing reads the `leaderboard` table at all. Removed
  // rather than left as dead, misleading code.

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/:userId/exclude')
  async exclude(@CurrentUser() admin: any, @Param('userId', ParseIntPipe) userId: number) {
    await this.userRepo.update(userId, { excluded_from_leaderboard: true });
    await this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_leaderboard_exclude',
      entityType: 'user', entityId: userId,
      description: `Admin excluded user #${userId} from the leaderboard`,
    });
    return { success: true, data: { excluded: true } };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/:userId/include')
  async include(@CurrentUser() admin: any, @Param('userId', ParseIntPipe) userId: number) {
    await this.userRepo.update(userId, { excluded_from_leaderboard: false });
    await this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_leaderboard_include',
      entityType: 'user', entityId: userId,
      description: `Admin re-included user #${userId} on the leaderboard`,
    });
    return { success: true, data: { excluded: false } };
  }

  // Score weights were hardcoded literals inline in the SQL — no admin
  // lever to retune without a code deploy.
  @Get('admin/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  async getConfig() {
    const data = await this.leaderboardConfig.getWeights();
    return { success: true, data };
  }

  @Put('admin/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('super')
  async updateConfig(@CurrentUser() admin: any, @Body() patch: Record<string, number>) {
    const data = await this.leaderboardConfig.setWeights(patch);
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_leaderboard_config_update',
      entityType: 'site_settings', entityId: 0,
      description: `Admin updated leaderboard weights: ${Object.keys(patch).join(', ')}`,
      metadata: patch,
    }).catch(() => {}));
    return { success: true, data, message: 'Leaderboard weights updated' };
  }

  @Put('admin/config/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('super')
  async resetConfig(@CurrentUser() admin: any) {
    const data = await this.leaderboardConfig.resetToDefaults();
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_leaderboard_config_reset',
      entityType: 'site_settings', entityId: 0,
      description: 'Admin reset leaderboard weights to defaults',
    }).catch(() => {}));
    return { success: true, data, message: 'Leaderboard weights reset to defaults' };
  }
}
