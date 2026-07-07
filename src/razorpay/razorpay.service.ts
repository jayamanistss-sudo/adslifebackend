import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as crypto from 'node:crypto';
// CommonJS export — no esModuleInterop in this tsconfig, so require-style import
import Razorpay = require('razorpay');

@Injectable()
export class RazorpayService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private readonly logger = new Logger(RazorpayService.name);
  private client: Razorpay | null = null;

  // Lazily constructed so a missing env var fails the request, not app boot
  private getClient(): Razorpay {
    if (this.client) return this.client;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return this.client;
  }

  async createOrder(userId: number, amountPaise: number, currency = 'INR', receipt?: string) {
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      throw new BadRequestException('amount must be an integer of at least 100 paise (₹1)');
    }

    try {
      const order = await this.getClient().orders.create({
        amount: amountPaise,
        currency,
        receipt: receipt ?? `adslife_u${userId}_${Date.now()}`,
        notes: { user_id: String(userId) },
      });
      await this.dataSource.query(
        `INSERT INTO razorpay_payments (user_id, order_id, amount, currency, receipt)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id) DO NOTHING`,
        [userId, order.id, order.amount, order.currency, receipt ?? null],
      );
      return {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID,
      };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.response?.status;
      const detail = e?.error?.description ?? e?.message ?? 'unknown error';
      this.logger.error(`Razorpay order creation failed: ${detail}`);
      if (status === 401) {
        throw new UnauthorizedException('Razorpay authentication failed — check API keys');
      }
      throw new InternalServerErrorException(`Could not create payment order: ${detail}`);
    }
  }

  /**
   * Standard Checkout signature verification:
   * HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) must equal the
   * signature Razorpay handed to the frontend.
   */
  async verifyPayment(orderId: string, paymentId: string, signature: string) {
    if (!orderId || !paymentId || !signature) {
      throw new BadRequestException('razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
    }
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // timingSafeEqual needs equal-length buffers — length check first
    const valid =
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

    if (!valid) {
      this.logger.warn(`Signature mismatch for order ${orderId}`);
      throw new BadRequestException('Payment signature verification failed');
    }

    await this.dataSource.query(
      `UPDATE razorpay_payments
          SET status = 'verified', payment_id = $2, verified_at = now()
        WHERE order_id = $1`,
      [orderId, paymentId],
    );
    return { verified: true, order_id: orderId, payment_id: paymentId };
  }

}
