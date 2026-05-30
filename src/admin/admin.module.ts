import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PushService } from '../services/push.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, PushService],
})
export class AdminModule {}
