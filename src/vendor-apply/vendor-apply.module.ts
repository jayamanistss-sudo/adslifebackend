import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorApplyController } from './vendor-apply.controller';
import { VendorApplication } from '../entities/vendor-application.entity';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { PushService } from '../services/push.service';

@Module({
  imports: [TypeOrmModule.forFeature([VendorApplication, User, UserFcmToken, Notification, NotificationOutbox])],
  controllers: [VendorApplyController],
  providers: [PushService],
})
export class VendorApplyModule {}
