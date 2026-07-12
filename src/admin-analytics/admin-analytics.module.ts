import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AuthLog } from '../entities/auth-log.entity';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { Offer } from '../entities/offer.entity';
import { VendorDailyStat } from '../entities/vendor-daily-stat.entity';
import { Payment } from '../entities/payment.entity';
import { Category } from '../entities/category.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    AuthLog, User, Vendor, Offer, VendorDailyStat, Payment, Category, Notification, NotificationOutbox,
  ])],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
