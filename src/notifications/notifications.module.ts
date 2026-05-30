import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from '../services/push.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
})
export class NotificationsModule {}
