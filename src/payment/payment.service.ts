import {
  Injectable, BadRequestException, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushService } from '../services/push.service';
import axios from 'axios';
import * as crypto from 'node:crypto';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
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
    const plan = await this.planRepo.findOne({ where: { id: planId, is_active: true } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (Number.parseFloat(String(plan.price)) === 0) return { free: true, plan: plan.slug };

    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['name', 'email', 'phone'] });
    if (!user) throw new NotFoundException('User not found');
    const orderId = 'AL_' + crypto.randomBytes(8).toString('hex').toUpperCase();

    const payload = {
      order_id: orderId,
      order_amount: Number.parseFloat(String(plan.price)),
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

    await this.paymentRepo.save({
      user_id: userId,
      order_id: orderId,
      payment_session_id: cfResponse.payment_session_id,
      amount: plan.price,
      purpose,
      reference_id: plan.id,
      reference_type: 'vendor_plan',
    });

    return { order_id: orderId, payment_session_id: cfResponse.payment_session_id, amount: Number.parseFloat(String(plan.price)), plan: plan.slug };
  }

  async verifyPayment(userId: number, orderId: string) {
    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId, user_id: userId } });
    if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status === PaymentStatus.PAID) return { status: 'paid', order_id: orderId };

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
      await this.paymentRepo.update(
        { order_id: orderId },
        { status: PaymentStatus.PAID, cashfree_payment_id: cfPaymentId, paid_at: new Date() },
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

    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId } });
    if (!pay || pay.status === PaymentStatus.PAID) return 'ok';

    await this.paymentRepo.update(
      { order_id: orderId },
      { status: PaymentStatus.PAID, cashfree_payment_id: cfPid, paid_at: new Date() },
    );
    await this.activateVendorPlan(pay);
    return 'ok';
  }

  private async activateVendorPlan(pay: Payment) {
    if (pay.reference_type !== 'vendor_plan' || !pay.reference_id) return;

    // Guard against webhook retries re-extending an already-active plan
    const vendor = await this.vendorRepo.findOne({
      where: { user_id: pay.user_id },
      select: ['id', 'subscription_plan', 'plan_expires_at'],
    });
    if (
      vendor &&
      vendor.subscription_plan === (await this.planRepo.findOne({ where: { id: pay.reference_id }, select: ['slug'] }))?.slug &&
      vendor.plan_expires_at &&
      vendor.plan_expires_at > new Date()
    ) return;

    const plan = await this.planRepo.findOne({
      where: { id: pay.reference_id },
      select: ['slug', 'duration_days'],
    });
    if (!plan) return;
    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000);
    await this.vendorRepo.update(
      { user_id: pay.user_id },
      { subscription_plan: plan.slug, plan_expires_at: expiresAt },
    );
    await this.push.send(
      +pay.user_id,
      'Plan Activated!',
      `Your ${plan.slug} plan is now live.`,
      { type: 'plan_activated' },
    );
  }
}
