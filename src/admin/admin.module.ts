import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PushService } from '../services/push.service';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { VendorApplication } from '../entities/vendor-application.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { FraudFlag } from '../entities/fraud-flag.entity';
import { Payment } from '../entities/payment.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { AuthLog } from '../entities/auth-log.entity';
import { Referral } from '../entities/referral.entity';
import { Category } from '../entities/category.entity';
import { MailModule } from '../mail/mail.module';
import { FraudModule } from '../fraud/fraud.module';
import { OffersModule } from '../offers/offers.module';
import { FeedModule } from '../feed/feed.module';
import { CashfreeModule } from '../cashfree/cashfree.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, Vendor, Offer, SiteSetting, VendorDailyStat, UserInteraction,
      VendorApplication, SubscriptionPlan, FraudFlag, Payment,
      UserFcmToken, Notification, NotificationOutbox, AuthLog, Referral, Category,
    ]),
    MailModule,
    FraudModule,
    OffersModule,
    FeedModule,
    CashfreeModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, PushService],
})
export class AdminModule {}
