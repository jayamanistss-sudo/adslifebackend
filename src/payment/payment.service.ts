import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushService } from '../services/push.service';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { CashfreeService } from '../cashfree/cashfree.service';

// Vendor subscription payments run entirely through Cashfree (same gateway as
// banner ads) — create a Cashfree order, open Checkout on the client, then
// independently re-check the order status server-side (via Cashfree's own
// API, not a client-submitted signature) before activating the plan.
@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
    private readonly push: PushService,
    private readonly cashfree: CashfreeService,
  ) {}

  // No public key is ever needed on the client for Cashfree — the checkout
  // SDK only needs the per-order payment_session_id returned by createOrder.
  async getPublicConfig() {
    return { mode: (await this.cashfree.getEnv()) ?? 'sandbox', gateway: 'cashfree' };
  }

  async createOrder(userId: number, planId: number, purpose = 'vendor_plan', billingCycle: 'monthly' | 'annual' = 'monthly') {
    const plan = await this.planRepo.findOne({ where: { id: planId, is_active: true } });
    if (!plan) throw new NotFoundException('Plan not found');

    const isAnnual = billingCycle === 'annual';
    if (isAnnual && plan.annual_price == null) {
      throw new BadRequestException(`${plan.name} doesn't offer annual billing`);
    }
    const price = Number.parseFloat(String(isAnnual ? plan.annual_price : plan.price));
    if (price === 0) return { free: true, plan: plan.slug };

    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['name', 'email', 'phone'] });
    if (!user) throw new NotFoundException('User not found');

    // Cashfree's order_amount is plain rupees — matches this column's own
    // unit directly, no paise conversion needed.
    const order = await this.cashfree.createOrder(
      userId, price, 'INR', `plan_${plan.id}_${userId}_${Date.now()}`,
      { name: user.name, email: user.email, phone: user.phone ?? undefined },
    );

    await this.paymentRepo.save({
      user_id: userId,
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
      amount: price,
      purpose,
      reference_id: plan.id,
      // Distinguishes which duration to apply on activation — reuses the
      // existing discriminator column rather than adding a new one.
      reference_type: isAnnual ? 'vendor_plan_annual' : 'vendor_plan',
    });

    return {
      order_id: order.order_id,
      payment_session_id: order.payment_session_id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.slug,
      billing_cycle: billingCycle,
      prefill: { name: user.name, email: user.email, contact: user.phone ?? '' },
    };
  }

  // Called by the client after Cashfree Checkout completes (success, drop or
  // failure — doesn't matter which, we don't trust the client's account of
  // it). Independently re-checks the order status with Cashfree, and only
  // activates the plan if Cashfree itself confirms PAID.
  async confirmPayment(userId: number, body: { order_id: string }) {
    const orderId = body.order_id;
    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId, user_id: userId } });
    if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status === PaymentStatus.PAID) return { status: 'paid', order_id: orderId };

    const { orderStatus, cfPaymentId } = await this.cashfree.getOrderStatus(orderId);
    if (orderStatus !== 'PAID') {
      return { status: 'pending', order_id: orderId };
    }

    await this.paymentRepo.update(
      { order_id: orderId },
      { status: PaymentStatus.PAID, cashfree_payment_id: cfPaymentId, paid_at: new Date() },
    );
    await this.activateVendorPlan(pay);
    return { status: 'paid', order_id: orderId };
  }

  // Backwards-compatible status check (no gateway polling — reads our record).
  async verifyPayment(userId: number, orderId: string) {
    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId, user_id: userId } });
    if (!pay) throw new NotFoundException('Payment not found');
    return { status: pay.status === PaymentStatus.PAID ? 'paid' : 'pending', order_id: orderId };
  }

  // No vendor-facing payment history existed — a vendor had no way to see
  // their own plan/banner payments without asking an admin.
  async myList(userId: number, status = '', page = 1, limit = 30) {
    const offset = (Math.max(page, 1) - 1) * limit;
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .where('p.user_id = :userId', { userId });
    if (status) qb.andWhere('p.status = :status', { status });

    const total = await qb.getCount();
    const payments = await qb
      .orderBy('p.created_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getMany();
    return { payments, total };
  }

  // No admin-wide payments ledger existed at all — an admin couldn't answer
  // "show me every payment this week" without a direct database query.
  async adminList(status = '', search = '', page = 1, limit = 30) {
    const offset = (Math.max(page, 1) - 1) * limit;
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin(User, 'u', 'u.id = p.user_id')
      .select(['p.*', 'u.name AS user_name', 'u.email AS user_email']);
    if (status) qb.andWhere('p.status = :status', { status });
    if (search) qb.andWhere('(u.name LIKE :s OR u.email LIKE :s OR p.order_id LIKE :s)', { s: `%${search}%` });

    const total = await qb.getCount();
    const payments = await qb
      .orderBy('p.created_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();
    return { payments, total };
  }

  // The REFUNDED status was defined in the schema and never once set by any
  // code path — every refund happened manually outside the platform.
  async adminRefund(paymentId: number, adminId: number, amountRupees?: number) {
    const pay = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Only a paid payment can be refunded');
    }
    if (!pay.cashfree_payment_id) {
      throw new BadRequestException('No gateway payment ID recorded for this payment — cannot refund via API');
    }
    // amountRupees came straight from the request body with no bound check
    // — a typo or a compromised admin session could refund more than the
    // original payment. Cashfree itself would likely reject an over-refund,
    // but that's their safety net, not ours; this is ours.
    if (amountRupees != null && (amountRupees <= 0 || amountRupees > Number(pay.amount))) {
      throw new BadRequestException(`Refund amount must be between 0 and the original payment amount (₹${pay.amount})`);
    }
    const result = await this.cashfree.refund(pay.order_id, `refund_${pay.id}_${Date.now()}`, amountRupees);
    await this.paymentRepo.update(paymentId, { status: PaymentStatus.REFUNDED });
    return { refunded: true, ...result };
  }

  // Cashfree webhook (optional — client confirm is the primary path). Verifies
  // the timestamp+rawBody HMAC signature, then marks paid + activates on
  // PAYMENT_SUCCESS_WEBHOOK. main.ts already captures the raw body and
  // x-webhook-timestamp/x-webhook-signature headers this needs.
  async handleWebhook(rawBody: string, timestamp: string, signature: string) {
    if (!(await this.cashfree.verifyWebhookSignature(rawBody, timestamp, signature))) {
      throw new BadRequestException('Invalid signature');
    }
    const event = JSON.parse(rawBody);
    if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK') return 'ok';
    const orderId = event.data?.order?.order_id ?? '';
    const paymentId = event.data?.payment?.cf_payment_id ?? null;
    if (!orderId) return 'ok';
    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId } });
    if (!pay || pay.status === PaymentStatus.PAID) return 'ok';
    await this.paymentRepo.update(
      { order_id: orderId },
      { status: PaymentStatus.PAID, cashfree_payment_id: paymentId, paid_at: new Date() },
    );
    await this.activateVendorPlan(pay);
    return 'ok';
  }

  private async activateVendorPlan(pay: Payment) {
    const isAnnual = pay.reference_type === 'vendor_plan_annual';
    if ((pay.reference_type !== 'vendor_plan' && !isAnnual) || !pay.reference_id) return;

    // Guard against retries re-extending an already-active plan
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
    const durationDays = isAnnual ? 365 : plan.duration_days;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    await this.vendorRepo.update(
      { user_id: pay.user_id },
      { subscription_plan: plan.slug, plan_expires_at: expiresAt },
    );
    await this.push.send(
      +pay.user_id,
      'Plan Activated!',
      `Your ${plan.slug} plan is now live${isAnnual ? ' for the next year' : ''}.`,
      { type: 'plan_activated' },
    );
  }
}
