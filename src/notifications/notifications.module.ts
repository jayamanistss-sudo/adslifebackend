import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, UserFcmToken])],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
})
export class NotificationsModule {}
