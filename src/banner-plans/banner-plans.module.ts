import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BannerPlansController } from './banner-plans.controller';
import { BannerPlan } from '../entities/banner-plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BannerPlan])],
  controllers: [BannerPlansController],
})
export class BannerPlansModule {}
