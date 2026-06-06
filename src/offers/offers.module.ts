import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PushService } from '../services/push.service';
import { GatewayModule } from '../gateway/gateway.module';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, Vendor, VendorFollower]),
    GatewayModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, PushService],
  exports: [OffersService],
})
export class OffersModule {}
