import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuthModule } from './auth/auth.module';
import { OffersModule } from './offers/offers.module';
import { FeedModule } from './feed/feed.module';
import { VendorModule } from './vendor/vendor.module';
import { AdminModule } from './admin/admin.module';
import { PaymentModule } from './payment/payment.module';
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
import { CategoriesModule } from './categories/categories.module';
import { PlansModule } from './plans/plans.module';
import { ShareModule } from './share/share.module';
import { SpotlightModule } from './spotlight/spotlight.module';
import { VendorApplyModule } from './vendor-apply/vendor-apply.module';
import { ReferralModule } from './referral/referral.module';
import { InviteModule } from './invite/invite.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,

    AuthModule,
    OffersModule,
    FeedModule,
    VendorModule,
    AdminModule,
    PaymentModule,
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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
