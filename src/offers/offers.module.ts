import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferReviewsService } from './offer-reviews.service';
import { OfferReportsService } from './offer-reports.service';
import { PushService } from '../services/push.service';
import { GatewayModule } from '../gateway/gateway.module';
import { Offer } from '../entities/offer.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { OfferReview } from '../entities/offer-review.entity';
import { OfferReport } from '../entities/offer-report.entity';
import { FraudFlag } from '../entities/fraud-flag.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, Vendor, VendorFollower, UserFcmToken, Notification, OfferReview, OfferReport, FraudFlag]),
    GatewayModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, PushService, OfferReviewsService, OfferReportsService],
  exports: [OffersService],
})
export class OffersModule {}
