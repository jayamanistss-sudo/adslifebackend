import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Leaderboard } from '../entities/leaderboard.entity';
import { LeaderboardQueryDto } from './dto/leaderboard.dto';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    @InjectRepository(Leaderboard) private readonly leaderboardRepo: Repository<Leaderboard>,
  ) {}

  @Public()
  @Get()
  async index(@Query() query: LeaderboardQueryDto) {
    const period = query.period ?? 'monthly';
    const limit = Math.min(query.limit ?? 50, 100);

    // Computed live from real user activity — no pre-built table to go stale.
    // Score: save ×10, redeem ×30, share ×5, view/click/direction ×2.
    const conditions = [`ui.action != 'search'`];
    const params: any[] = [];
    if (period === 'weekly') {
      conditions.push(`ui.created_at >= NOW() - INTERVAL '7 days'`);
    } else if (period === 'monthly') {
      conditions.push(`ui.created_at >= NOW() - INTERVAL '30 days'`);
    }
    if (query.city) {
      params.push(query.city);
      conditions.push(`LOWER(u.city) = LOWER($${params.length})`);
    }
    params.push(limit);

    const rows = await this.leaderboardRepo.manager.query(
      `SELECT u.id AS user_id, u.name, u.avatar_url, COALESCE(u.city, '') AS city,
              SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END)::int AS total_saves,
              SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END)::int AS total_redemptions,
              (SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END) * 10 +
               SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END) * 30 +
               SUM(CASE WHEN ui.action = 'share'  THEN 1 ELSE 0 END) * 5 +
               SUM(CASE WHEN ui.action IN ('view','click','direction') THEN 1 ELSE 0 END) * 2)::int AS score
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

    const conditions = [`ui.action != 'search'`];
    const params: any[] = [];
    if (period === 'weekly') {
      conditions.push(`ui.created_at >= NOW() - INTERVAL '7 days'`);
    } else if (period === 'monthly') {
      conditions.push(`ui.created_at >= NOW() - INTERVAL '30 days'`);
    }
    if (city) {
      params.push(city);
      conditions.push(`LOWER(u.city) = LOWER($${params.length})`);
    }

    // Same scoring as the public leaderboard; rank is the user's position
    // within their city (or globally when they have no city set).
    const rows = await this.leaderboardRepo.manager.query(
      `SELECT u.id AS user_id,
              SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END)::int AS total_saves,
              SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END)::int AS total_redemptions,
              (SUM(CASE WHEN ui.action = 'save'   THEN 1 ELSE 0 END) * 10 +
               SUM(CASE WHEN ui.action = 'redeem' THEN 1 ELSE 0 END) * 30 +
               SUM(CASE WHEN ui.action = 'share'  THEN 1 ELSE 0 END) * 5 +
               SUM(CASE WHEN ui.action IN ('view','click','direction') THEN 1 ELSE 0 END) * 2)::int AS score
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post('rebuild')
  async rebuild() {
    await this.leaderboardRepo.manager.query(`
      INSERT INTO leaderboard (user_id, period, score, city)
      SELECT u.id, 'monthly',
             COALESCE((SELECT COUNT(*) FROM saved_offers so WHERE so.user_id = u.id
               AND EXTRACT(MONTH FROM so.created_at) = EXTRACT(MONTH FROM NOW())
               AND EXTRACT(YEAR FROM so.created_at) = EXTRACT(YEAR FROM NOW())), 0),
             u.city
      FROM users u
      ON CONFLICT (user_id, period) DO UPDATE SET score = EXCLUDED.score
    `);
    return { success: true, data: { rebuilt: true } };
  }
}
