import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BannerAdsController } from './banner-ads.controller';
import { BannerAdRequest } from '../entities/banner-ad-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { BannerPlan } from '../entities/banner-plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BannerAdRequest, Vendor, BannerPlan])],
  controllers: [BannerAdsController],
})
export class BannerAdsModule {}
