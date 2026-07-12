import {
  Controller, Post, Get, Put, Body, Query, Param, ParseIntPipe, Headers, Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { MonitoringService } from '../monitoring/monitoring.service';
import { CreateOrderDto, VerifyPaymentQueryDto } from './dto/payment.dto';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly monitoring: MonitoringService,
  ) {}

  @Public()
  @Get('config')
  async publicConfig() {
    const data = await this.paymentService.getPublicConfig();
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('create-order')
  async createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    const data = await this.paymentService.createOrder(
      user.user_id,
      dto.plan_id,
      dto.purpose ?? 'vendor_plan',
      dto.billing_cycle ?? 'monthly',
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('confirm')
  async confirm(
    @CurrentUser() user: any,
    @Body() body: { order_id: string },
  ) {
    const data = await this.paymentService.confirmPayment(user.user_id, body);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('verify')
  async verify(@CurrentUser() user: any, @Query() query: VerifyPaymentQueryDto) {
    const data = await this.paymentService.verifyPayment(user.user_id, query.order_id);
    return { success: true, data };
  }

  // No vendor-facing "my payments" page existed anywhere — a vendor had no
  // way to see their own plan/banner payment history.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my-list')
  async myList(
    @CurrentUser() user: any,
    @Query('status') status = '',
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    const data = await this.paymentService.myList(user.user_id, status, Number(page) || 1, Number(limit) || 30);
    return { success: true, data };
  }

  // No admin-wide payments/transactions list existed anywhere in the app.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Get('admin/list')
  async adminList(
    @Query('status') status = '',
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    const data = await this.paymentService.adminList(status, search, Number(page) || 1, Number(limit) || 30);
    return { success: true, data };
  }

  // PaymentStatus.REFUNDED existed in the schema with no code path that ever
  // set it — every refund had to happen manually outside the platform.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin')
  @Put('admin/:id/refund')
  async adminRefund(
    @CurrentUser() admin: any,
    @Param('id', ParseIntPipe) id: number,
    @Body('amount') amountRupees?: number,
  ) {
    const data = await this.paymentService.adminRefund(id, admin.user_id, amountRupees);
    setImmediate(() => this.monitoring.logActivity({
      userId: admin.user_id, role: 'admin', action: 'admin_payment_refund',
      entityType: 'payment', entityId: id,
      description: `Admin refunded payment #${id}`,
      metadata: { amount: amountRupees },
    }).catch(() => {}));
    return { success: true, data, message: 'Refund processed' };
  }

  @Public()
  @Post('webhook')
  async webhook(
    @Req() req: Request,
    @Headers('x-webhook-timestamp') timestamp: string = '',
    @Headers('x-webhook-signature') signature: string = '',
  ) {
    // req.body is a raw Buffer here because of the express.raw() middleware
    // applied to this route in main.ts — use it directly for accurate HMAC
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);
    return this.paymentService.handleWebhook(rawBody, timestamp, signature);
  }
}
