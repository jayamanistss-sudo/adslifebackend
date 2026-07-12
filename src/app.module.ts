import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import { SiteSetting } from './entities/site-setting.entity';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MonitoringModule } from './monitoring/monitoring.module';
import { RequestLoggingMiddleware } from './monitoring/middleware/request-logging.middleware';

import { AuthModule } from './auth/auth.module';
import { OffersModule } from './offers/offers.module';
import { FeedModule } from './feed/feed.module';
import { VendorModule } from './vendor/vendor.module';
import { AdminModule } from './admin/admin.module';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { PaymentModule } from './payment/payment.module';
import { CashfreeModule } from './cashfree/cashfree.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FraudModule } from './fraud/fraud.module';
import { GroupDealsModule } from './group-deals/group-deals.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { SupportModule } from './support/support.module';
import { TargetingModule } from './targeting/targeting.module';
import { TranslateModule } from './translate/translate.module';
import { UploadModule } from './upload/upload.module';
import { AbTestModule } from './ab-test/ab-test.module';
import { BannerAdsModule } from './banner-ads/banner-ads.module';
import { BannerPlansModule } from './banner-plans/banner-plans.module';
import { CategoriesModule } from './categories/categories.module';
import { PlansModule } from './plans/plans.module';
import { ShareModule } from './share/share.module';
import { SpotlightModule } from './spotlight/spotlight.module';
import { VendorApplyModule } from './vendor-apply/vendor-apply.module';
import { ReferralModule } from './referral/referral.module';
import { InviteModule } from './invite/invite.module';
import { GatewayModule } from './gateway/gateway.module';
import { NotificationSettingsModule } from './notification-settings/notification-settings.module';
import { PlanFeaturesModule } from './plan-features/plan-features.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    TypeOrmModule.forFeature([SiteSetting]),

    // MonitoringModule must be first so it's available globally
    MonitoringModule,
    NotificationSettingsModule,
    PlanFeaturesModule,

    AuthModule,
    OffersModule,
    FeedModule,
    VendorModule,
    AdminModule,
    AdminAnalyticsModule,
    PaymentModule,
    CashfreeModule,
    NotificationsModule,
    AnalyticsModule,
    FraudModule,
    GroupDealsModule,
    LeaderboardModule,
    SupportModule,
    TargetingModule,
    TranslateModule,
    UploadModule,
    AbTestModule,
    BannerAdsModule,
    BannerPlansModule,
    CategoriesModule,
    PlansModule,
    ShareModule,
    SpotlightModule,
    VendorApplyModule,
    ReferralModule,
    InviteModule,
    GatewayModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
