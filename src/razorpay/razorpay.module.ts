import { Module } from '@nestjs/common';
import { RazorpayController } from './razorpay.controller';
import { RazorpayService } from './razorpay.service';

@Module({
  controllers: [RazorpayController],
  providers: [RazorpayService],
  exports: [RazorpayService],
})
export class RazorpayModule {}
