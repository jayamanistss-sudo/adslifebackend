import {
  Injectable, BadRequestException, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushService } from '../services/push.service';
import axios from 'axios';
import * as crypto from 'node:crypto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly push: PushService,
  ) {}

  private get cashfreeBase() { return this.config.get<string>('cashfree.baseUrl'); }
  private get appId() { return this.config.get<string>('cashfree.appId'); }
  private get secretKey() { return this.config.get<string>('cashfree.secretKey'); }
  private get webhookSecret() { return this.config.get<string>('cashfree.webhookSecret'); }
  private get appUrl() { return this.config.get<string>('appUrl'); }
  private get frontendUrl() { return this.config.get<string>('frontendUrl'); }

  async createOrder(userId: number, planId: number, purpose = 'vendor_plan') {
    const [plan] = await this.db.query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true', [planId],
    );
    if (!plan) throw new NotFoundException('Plan not found');

    if (Number.parseFloat(plan.price) === 0) return { free: true, plan: plan.slug };

    const [user] = await this.db.query('SELECT name, email, phone FROM users WHERE id = $1', [userId]);
    const orderId = 'AL_' + crypto.randomBytes(8).toString('hex').toUpperCase();

    const payload = {
      order_id: orderId,
      order_amount: Number.parseFloat(plan.price),
      order_currency: 'INR',
      customer_details: {
        customer_id: `USR_${userId}`,
        customer_name: user.name,
        customer_email: user.email,
        customer_phone: user.phone || '9999999999',
      },
      order_meta: {
        return_url: `${this.frontendUrl}/vendor/select-plan?order_id=${orderId}`,
        notify_url: `${this.appUrl}/api/payment/webhook`,
      },
    };

    let cfResponse: any;
    try {
      const { data } = await axios.post(`${this.cashfreeBase}/orders`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': '2025-01-01',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
        },
      });
      cfResponse = data;
    } catch (e: any) {
      throw new ServiceUnavailableException('Payment gateway error: ' + (e.response?.data?.message ?? 'Unknown'));
    }

    if (!cfResponse?.payment_session_id) {
      throw new ServiceUnavailableException('Payment gateway error: ' + (cfResponse?.message ?? 'Unknown'));
    }

    await this.db.query(
      'INSERT INTO payments (user_id, order_id, payment_session_id, amount, purpose, reference_id, reference_type) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, orderId, cfResponse.payment_session_id, plan.price, purpose, plan.id, 'vendor_plan'],
    );

    return { order_id: orderId, payment_session_id: cfResponse.payment_session_id, amount: Number.parseFloat(plan.price), plan: plan.slug };
  }

  async verifyPayment(userId: number, orderId: string) {
    const [pay] = await this.db.query(
      'SELECT * FROM payments WHERE order_id = $1 AND user_id = $2', [orderId, userId],
    );
    if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status === 'paid') return { status: 'paid', order_id: orderId };

    let cfResponse: any;
    try {
      const { data } = await axios.get(`${this.cashfreeBase}/orders/${orderId}/payments`, {
        headers: { 'x-api-version': '2025-01-01', 'x-client-id': this.appId, 'x-client-secret': this.secretKey },
      });
      cfResponse = data;
    } catch { cfResponse = []; }

    let paid = false, cfPaymentId: string | null = null;
    if (Array.isArray(cfResponse)) {
      for (const p of cfResponse) {
        if (p.payment_status === 'SUCCESS') { paid = true; cfPaymentId = p.cf_payment_id ?? null; break; }
      }
    }

    if (paid) {
      await this.db.query(
        'UPDATE payments SET status = \'paid\', cashfree_payment_id = $1, paid_at = NOW() WHERE order_id = $2',
        [cfPaymentId, orderId],
      );
      await this.activateVendorPlan(pay);
      return { status: 'paid', order_id: orderId };
    }

    return { status: cfResponse[0]?.payment_status ?? 'pending', order_id: orderId };
  }

  async handleWebhook(rawBody: string, timestamp: string, signature: string) {
    if (!timestamp || !signature) throw new BadRequestException('Missing webhook signature headers');
    if (!this.webhookSecret) throw new BadRequestException('Webhook secret not configured');

    const expected = Buffer.from(
      crypto.createHmac('sha256', this.webhookSecret).update(timestamp + rawBody).digest(),
    ).toString('base64');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      throw new BadRequestException('Invalid signature');
    }

    const event = JSON.parse(rawBody);
    if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') return 'ok';

    const data = event.data ?? {};
    const orderId = data.order?.order_id ?? '';
    const cfPid = data.payment?.cf_payment_id ?? null;
    const status = data.payment?.payment_status ?? '';

    if (status !== 'SUCCESS' || !orderId) return 'ok';

    const [pay] = await this.db.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    if (!pay || pay.status === 'paid') return 'ok';

    await this.db.query(
      'UPDATE payments SET status = \'paid\', cashfree_payment_id = $1, paid_at = NOW() WHERE order_id = $2',
      [cfPid, orderId],
    );
    await this.activateVendorPlan(pay);
    return 'ok';
  }

  private async activateVendorPlan(pay: any) {
    if (pay.reference_type !== 'vendor_plan' || !pay.reference_id) return;
    const [plan] = await this.db.query(
      'SELECT slug, duration_days FROM subscription_plans WHERE id = $1', [pay.reference_id],
    );
    if (!plan) return;
    await this.db.query(
      'UPDATE vendors SET subscription_plan = $1, plan_expires_at = NOW() + ($2 * INTERVAL \'1 day\') WHERE user_id = $3',
      [plan.slug, plan.duration_days, pay.user_id],
    );
    await this.push.send(
      +pay.user_id,
      'Plan Activated!',
      `Your ${plan.slug} plan is now live.`,
      { type: 'plan_activated' },
    );
  }
}
