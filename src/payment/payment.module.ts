import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PushService } from '../services/push.service';
import { Payment } from '../entities/payment.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { RazorpayModule } from '../razorpay/razorpay.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Vendor, User, SubscriptionPlan, UserFcmToken, Notification, NotificationOutbox, SiteSetting]),
    RazorpayModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, PushService],
})
export class PaymentModule {}
