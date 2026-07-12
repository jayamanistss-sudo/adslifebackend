import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardConfigService } from './leaderboard-config.service';
import { Leaderboard } from '../entities/leaderboard.entity';
import { User } from '../entities/user.entity';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Leaderboard, User, SiteSetting])],
  controllers: [LeaderboardController],
  providers: [LeaderboardConfigService],
})
export class LeaderboardModule {}
