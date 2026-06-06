import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { LeaderboardQueryDto } from './dto/leaderboard.dto';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Public()
  @Get()
  async index(@Query() query: LeaderboardQueryDto) {
    const period = query.period ?? 'monthly';
    const limit = Math.min(query.limit ?? 50, 100);
    const params: any[] = [period];
    let sql = 'SELECT l.*, u.name, u.avatar_url, u.city as user_city FROM leaderboard l JOIN users u ON l.user_id = u.id WHERE l.period = $1';
    if (query.city) { sql += ` AND l.city = $${params.length + 1}`; params.push(query.city); }
    sql += ` ORDER BY l.score DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await this.db.query(sql, params);
    const data = rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Post('rebuild')
  async rebuild() {
    await this.db.query(`
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
