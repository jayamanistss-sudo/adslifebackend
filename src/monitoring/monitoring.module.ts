import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { SecurityService } from './security.service';
import { AuthLog } from '../entities/auth-log.entity';
import { ActivityLog } from '../entities/activity-log.entity';
import { ApiLog } from '../entities/api-log.entity';
import { ErrorLog } from '../entities/error-log.entity';
import { SecurityEvent } from '../entities/security-event.entity';
import { AlertLog } from '../entities/alert-log.entity';
import { BlockedIp } from '../entities/blocked-ip.entity';
import { User } from '../entities/user.entity';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuthLog, ActivityLog, ApiLog, ErrorLog, SecurityEvent, AlertLog, BlockedIp, User]),
    MailModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService, SecurityService],
  exports: [MonitoringService, SecurityService],
})
export class MonitoringModule {}
