import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ReferralModule } from '../referral/referral.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { UserPreference } from '../entities/user-preference.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { UserLocation } from '../entities/user-location.entity';
import { EmailChangeRequest } from '../entities/email-change-request.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SiteSetting } from '../entities/site-setting.entity';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<number>('jwt.ttl'),
        },
      }),
    }),
    TypeOrmModule.forFeature([User, Vendor, UserPreference, PasswordReset, UserLocation, EmailChangeRequest, SubscriptionPlan, SiteSetting]),
    ReferralModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
