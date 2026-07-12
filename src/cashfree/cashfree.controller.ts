import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CashfreeService } from './cashfree.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CashfreeCreateOrderDto, CashfreeVerifyDto } from './dto/cashfree.dto';

// Generic create-order/verify-payment pair — used by the standalone
// CashfreeTest page (ported from the old PayTest/Razorpay page). Domain
// flows (vendor plans, banner ads) call CashfreeService directly and track
// state on their own tables instead of this generic one.
@ApiTags('cashfree')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cashfree')
export class CashfreeController {
  constructor(
    private readonly cashfreeService: CashfreeService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post('create-order')
  async createOrder(@CurrentUser() user: any, @Body() dto: CashfreeCreateOrderDto) {
    const order = await this.cashfreeService.createOrder(
      user.user_id,
      dto.amount,
      dto.currency ?? 'INR',
      dto.receipt,
      { name: user.name, email: user.email, phone: user.phone },
    );
    await this.dataSource.query(
      `INSERT INTO cashfree_payments (user_id, order_id, payment_session_id, amount, currency, receipt)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (order_id) DO NOTHING`,
      [user.user_id, order.order_id, order.payment_session_id, order.amount, order.currency, dto.receipt ?? null],
    );
    return { success: true, data: order };
  }

  @Post('verify-payment')
  async verifyPayment(@CurrentUser() user: any, @Body() dto: CashfreeVerifyDto) {
    const { orderStatus, cfPaymentId } = await this.cashfreeService.getOrderStatus(dto.order_id);
    const verified = orderStatus === 'PAID';
    if (verified) {
      // order_id is guessable (adslife_u{userId}_{timestamp}) and this had
      // no ownership check at all — any authenticated user could update
      // another user's cashfree_payments row by passing their order_id.
      await this.dataSource.query(
        `UPDATE cashfree_payments
            SET status = 'verified', cf_payment_id = $2, verified_at = now()
          WHERE order_id = $1 AND user_id = $3`,
        [dto.order_id, cfPaymentId, user.user_id],
      );
    }
    return { success: verified, data: { verified, order_id: dto.order_id, order_status: orderStatus } };
  }
}
