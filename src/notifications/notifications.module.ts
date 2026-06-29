import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PromoNotificationService } from './promo-notification.service';
import { PersonalizedNotificationService } from './personalized-notification.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationCapService } from './notification-cap.service';
import { GeminiTemplateService } from './gemini-template.service';
import { PushOutboxService } from './push-outbox.service';
import { InterestNotificationService } from './interest-notification.service';
import { PushService } from '../services/push.service';
import { Notification } from '../entities/notification.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { User } from '../entities/user.entity';
import { UserInteraction } from '../entities/user-interaction.entity';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    Notification, UserFcmToken, User, UserInteraction, NotificationTemplate, NotificationOutbox,
  ])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushService,
    PushOutboxService,
    PromoNotificationService,
    PersonalizedNotificationService,
    NotificationTemplateService,
    NotificationCapService,
    GeminiTemplateService,
    InterestNotificationService,
  ],
  exports: [PushService, NotificationTemplateService],
})
export class NotificationsModule {}
