import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Leaderboard } from '../entities/leaderboard.entity';
import { User } from '../entities/user.entity';
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

    const qb = this.leaderboardRepo
      .createQueryBuilder('l')
      .innerJoin(User, 'u', 'l.user_id = u.id')
      .select(['l', 'u.name', 'u.avatar_url', 'u.city as user_city'])
      .where('l.period = :period', { period })
      .orderBy('l.score', 'DESC')
      .limit(limit);

    if (query.city) {
      qb.andWhere('l.city = :city', { city: query.city });
    }

    const rows = await qb.getRawMany();
    const data = rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));
    return { success: true, data };
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
