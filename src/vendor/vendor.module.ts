import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorController } from './vendor.controller';
import { VendorService } from './vendor.service';
import { PlanExpiryService } from './plan-expiry.service';
import { PushService } from '../services/push.service';
import { Vendor } from '../entities/vendor.entity';
import { VendorFollower } from '../entities/vendor-follower.entity';
import { User } from '../entities/user.entity';
import { Offer } from '../entities/offer.entity';
import { OfferReview } from '../entities/offer-review.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Vendor, VendorFollower, User, Offer, OfferReview, UserInteraction, SubscriptionPlan,
    UserFcmToken, Notification, NotificationOutbox,
  ])],
  controllers: [VendorController],
  providers: [VendorService, PlanExpiryService, PushService],
  exports: [VendorService],
})
export class VendorModule {}
