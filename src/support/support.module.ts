import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportTicket } from '../entities/support-ticket.entity';
import { SupportReply } from '../entities/support-reply.entity';
import { User } from '../entities/user.entity';
import { UserFcmToken } from '../entities/user-fcm-token.entity';
import { Notification } from '../entities/notification.entity';
import { NotificationOutbox } from '../entities/notification-outbox.entity';
import { GatewayModule } from '../gateway/gateway.module';
import { MailModule } from '../mail/mail.module';
import { PushService } from '../services/push.service';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket, SupportReply, User, UserFcmToken, Notification, NotificationOutbox]), GatewayModule, MailModule],
  controllers: [SupportController],
  providers: [SupportService, PushService],
})
export class SupportModule {}
