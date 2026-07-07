import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushService } from '../services/push.service';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { Vendor } from '../entities/vendor.entity';
import { User } from '../entities/user.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SiteSetting } from '../entities/site-setting.entity';
import { RazorpayService } from '../razorpay/razorpay.service';

// Vendor subscription payments run entirely through Razorpay (same gateway as
// banner ads) — create a Razorpay order, open Checkout on the client, then
// confirm the HMAC signature server-side before activating the plan.
@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SubscriptionPlan) private readonly planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
    private readonly config: ConfigService,
    private readonly push: PushService,
    private readonly razorpay: RazorpayService,
  ) {}

  async getPublicConfig() {
    return { key_id: process.env.RAZORPAY_KEY_ID ?? '', gateway: 'razorpay' };
  }

  async createOrder(userId: number, planId: number, purpose = 'vendor_plan') {
    const plan = await this.planRepo.findOne({ where: { id: planId, is_active: true } });
    if (!plan) throw new NotFoundException('Plan not found');

    const price = Number.parseFloat(String(plan.price));
    if (price === 0) return { free: true, plan: plan.slug };

    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['name', 'email', 'phone'] });
    if (!user) throw new NotFoundException('User not found');

    // Razorpay works in paise; reuse the shared service (also used for banners).
    const order = await this.razorpay.createOrder(
      userId, Math.round(price * 100), 'INR', `plan_${plan.id}_${userId}`,
    );

    await this.paymentRepo.save({
      user_id: userId,
      order_id: order.order_id,
      amount: plan.price,
      purpose,
      reference_id: plan.id,
      reference_type: 'vendor_plan',
    });

    return {
      order_id: order.order_id,
      key_id: order.key_id,
      amount: order.amount,
      currency: order.currency,
      plan: plan.slug,
      prefill: { name: user.name, email: user.email, contact: user.phone ?? '' },
    };
  }

  // Called by the client after Razorpay Checkout succeeds. Verifies the
  // signature, marks the payment paid and activates the vendor's plan.
  async confirmPayment(
    userId: number,
    body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) {
    const orderId = body.razorpay_order_id;
    const pay = await this.paymentRepo.findOne({ where: { order_id: orderId, user_id: userId } });
    if (!pay) throw new NotFoundException('Payment not found');
    if (pay.status === PaymentStatus.PAID) return { status: 'paid', order_id: orderId };

    // Throws if the HMAC signature doesn't match.
    await this.razorpay.verifyPayment(orderId, body.razorpay_payment_id, body.razorpay_signature);

    await this.paymentRepo.update(
      { order_id: orderId },
      { status: PaymentStatus.PAID, cashfree_payment_id: body.razorpay_payment_id, paid_at: new Date() },
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

  // Razorpay webhook (optional — client confirm is the primary path). Verifies
  // the webhook signature, then marks paid + activates on payment.captured.
  async handleWebhook(rawBody: string, _timestamp: string, signature: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
    if (!secret) return 'ok'; // webhook not configured — confirm flow handles it
    const crypto = await import('node:crypto');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== (signature?.length ?? 0) ||
        !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new BadRequestException('Invalid signature');
    }
    const event = JSON.parse(rawBody);
    if (event.event !== 'payment.captured' && event.event !== 'order.paid') return 'ok';
    const orderId = event.payload?.payment?.entity?.order_id
      ?? event.payload?.order?.entity?.id ?? '';
    const paymentId = event.payload?.payment?.entity?.id ?? null;
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
    if (pay.reference_type !== 'vendor_plan' || !pay.reference_id) return;

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
