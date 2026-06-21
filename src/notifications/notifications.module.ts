import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PromoNotificationService } from './promo-notification.service';
import { PersonalizedNotificationService } from './personalized-notification.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';
import { GeminiTemplateService } from './gemini-template.service';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { User } from '../entities/user.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { NotificationTemplate } from '../entities/notification-template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, UserFcmToken, User, UserInteraction, NotificationTemplate])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushService,
    PromoNotificationService,
    PersonalizedNotificationService,
    NotificationTemplateService,
    NotificationCapService,
    GeminiTemplateService,
  ],
  exports: [PushService, NotificationTemplateService],
})
export class NotificationsModule {}
