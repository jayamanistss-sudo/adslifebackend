import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { SecurityService } from './security.service';
import { AuthLog } from '../entities/auth-log.entity';
import { ActivityLog } from '../entities/activity-log.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuthLog, ActivityLog])],
  controllers: [MonitoringController],
  providers: [MonitoringService, SecurityService],
  exports: [MonitoringService, SecurityService],
})
export class MonitoringModule {}
