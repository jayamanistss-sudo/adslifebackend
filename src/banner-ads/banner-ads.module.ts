import { Module } from '@nestjs/common';
import { BannerAdsController } from './banner-ads.controller';

@Module({ controllers: [BannerAdsController] })
export class BannerAdsModule {}
