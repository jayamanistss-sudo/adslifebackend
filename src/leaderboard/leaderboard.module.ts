import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardController } from './leaderboard.controller';
import { Leaderboard } from '../entities/leaderboard.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Leaderboard, User])],
  controllers: [LeaderboardController],
})
export class LeaderboardModule {}
