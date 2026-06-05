import { Global, Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { MonitoringController } from './monitoring.controller';
import { SecurityService } from './security.service';

@Global()
@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, SecurityService],
  exports: [MonitoringService, SecurityService],
})
export class MonitoringModule {}
