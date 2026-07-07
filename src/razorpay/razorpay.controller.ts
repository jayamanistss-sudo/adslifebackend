import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RazorpayCreateOrderDto, RazorpayVerifyDto } from './dto/razorpay.dto';

@ApiTags('razorpay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('razorpay')
export class RazorpayController {
  constructor(private readonly razorpayService: RazorpayService) {}

  @Post('create-order')
  async createOrder(@CurrentUser() user: any, @Body() dto: RazorpayCreateOrderDto) {
    const data = await this.razorpayService.createOrder(
      user.user_id,
      dto.amount,
      dto.currency ?? 'INR',
      dto.receipt,
    );
    return { success: true, data };
  }

  @Post('verify-payment')
  async verifyPayment(@Body() dto: RazorpayVerifyDto) {
    const data = await this.razorpayService.verifyPayment(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );
    return { success: true, data };
  }
}
