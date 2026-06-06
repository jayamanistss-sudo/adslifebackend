import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Offer } from '../entities/offer.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { Vendor } from '../entities/vendor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Offer, UserInteraction, VendorDailyStat, Vendor])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
