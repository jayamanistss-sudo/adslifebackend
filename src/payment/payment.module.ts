import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PushService } from '../services/push.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PushService],
})
export class PaymentModule {}
