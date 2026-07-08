import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSetting } from '../entities/notification-setting.entity';

// Global — PushService (instantiated separately in 6 different feature
// modules) and the admin controller both need this without each of those
// modules having to import it individually.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([NotificationSetting])],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
