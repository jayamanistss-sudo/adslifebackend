import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudController } from './fraud.controller';
import { FraudDetectorService } from '../services/fraud-detector.service';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FraudFlag, Vendor, Offer])],
  controllers: [FraudController],
  providers: [FraudDetectorService],
})
export class FraudModule {}
