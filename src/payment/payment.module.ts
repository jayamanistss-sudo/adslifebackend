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

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Vendor, User, SubscriptionPlan, UserFcmToken, Notification, NotificationOutbox])],
  controllers: [PaymentController],
  providers: [PaymentService, PushService],
})
export class PaymentModule {}
