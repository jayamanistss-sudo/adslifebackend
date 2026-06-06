import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { PushService } from '../services/push.service';
import { GatewayModule } from '../gateway/gateway.module';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, Vendor, VendorFollower, UserFcmToken, Notification]),
    GatewayModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, PushService],
  exports: [OffersService],
})
export class OffersModule {}
