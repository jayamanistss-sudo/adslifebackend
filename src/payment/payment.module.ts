import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PushService } from '../services/push.service';
import { Payment } from '../entities/payment.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Vendor, User])],
  controllers: [PaymentController],
  providers: [PaymentService, PushService],
})
export class PaymentModule {}
