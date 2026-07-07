import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OfferReviewsService } from './offer-reviews.service';
import { OfferReportsService } from './offer-reports.service';
import { PushService } from '../services/push.service';
import { GatewayModule } from '../gateway/gateway.module';
import { MailModule } from '../mail/mail.module';
import { Offer } from '../entities/offer.entity';
import { RedemptionCode } from '../entities/redemption-code.entity';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { OfferReview } from '../entities/offer-review.entity';
import { OfferReport } from '../entities/offer-report.entity';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserInteraction } from '../entities/user-interaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, Vendor, VendorFollower, User, UserFcmToken, Notification, OfferReview, OfferReport, FraudFlag, NotificationOutbox, SubscriptionPlan, RedemptionCode, UserInteraction]),
    GatewayModule,
    MailModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, PushService, OfferReviewsService, OfferReportsService],
  exports: [OffersService],
})
export class OffersModule {}
