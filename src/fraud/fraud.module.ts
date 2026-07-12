import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudController } from './fraud.controller';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { FraudConfigService } from '../services/fraud-config.service';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FraudFlag, Vendor, Offer, SiteSetting])],
  controllers: [FraudController],
  providers: [FraudDetectorService, FraudConfigService],
  exports: [FraudDetectorService, FraudConfigService],
})
export class FraudModule {}
