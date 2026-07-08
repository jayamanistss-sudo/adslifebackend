import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotlightController } from './spotlight.controller';
import { SpotlightRequest } from '../entities/spotlight-request.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { GatewayModule } from '../gateway/gateway.module';
import { MailModule } from '../mail/mail.module';
import { PushService } from '../services/push.service';

@Module({
  imports: [TypeOrmModule.forFeature([SpotlightRequest, Vendor, User, UserFcmToken, Notification, NotificationOutbox]), GatewayModule, MailModule],
  controllers: [SpotlightController],
  providers: [PushService],
})
export class SpotlightModule {}
