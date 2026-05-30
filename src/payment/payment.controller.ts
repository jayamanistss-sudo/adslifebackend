import {
  Controller, Post, Get, Body, Query, Headers, Req,
  UseGuards, RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateOrderDto, VerifyPaymentQueryDto } from './dto/payment.dto';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('create-order')
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const data = await this.paymentService.createOrder(
      user.user_id,
      dto.plan_id,
      dto.purpose ?? 'vendor_plan',
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('verify')
  async verify(@CurrentUser() user: any, @Query() query: VerifyPaymentQueryDto) {
    const data = await this.paymentService.verifyPayment(user.user_id, query.order_id);
    return { success: true, data };
  }

  @Public()
  @Post('webhook')
  async webhook(
    @Req() req: Request,
    @Headers('x-webhook-timestamp') timestamp: string = '',
    @Headers('x-webhook-signature') signature: string = '',
  ) {
    const rawBody = JSON.stringify(req.body);
    return this.paymentService.handleWebhook(rawBody, timestamp, signature);
  }
}
