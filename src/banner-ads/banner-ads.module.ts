import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BannerAdsController } from './banner-ads.controller';
import { BannerAdRequest } from '../entities/banner-ad-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { BannerPlan } from '../entities/banner-plan.entity';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { GatewayModule } from '../gateway/gateway.module';
import { MailModule } from '../mail/mail.module';
import { PushService } from '../services/push.service';

@Module({
  imports: [TypeOrmModule.forFeature([BannerAdRequest, Vendor, BannerPlan, User, UserFcmToken, Notification, NotificationOutbox]), RazorpayModule, GatewayModule, MailModule],
  controllers: [BannerAdsController],
  providers: [PushService],
})
export class BannerAdsModule {}
