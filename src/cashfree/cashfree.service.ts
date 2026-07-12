import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'node:crypto';
import { SiteSetting } from '../entities/site-setting.entity';

const API_VERSION = '2023-08-01';

export interface CashfreeCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface CashfreeOrder {
  order_id: string;
  payment_session_id: string;
  amount: number;
  currency: string;
}

export interface CashfreeOrderStatus {
  orderStatus: string;
  cfPaymentId: string | null;
}

@Injectable()
export class CashfreeService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SiteSetting) private readonly settingRepo: Repository<SiteSetting>,
  ) {}

  private readonly logger = new Logger(CashfreeService.name);

  // Reads live from site_settings (admin-editable in Site Settings) on every
  // call, falling back to the .env values for any key the admin hasn't set
  // via the panel yet — this is what lets credentials be rotated from the
  // admin UI with no server restart, unlike the old env-only, cached-once
  // client this replaced.
  private async getConfig() {
    const rows = await this.settingRepo.find({
      where: [
        { key: 'cashfree_app_id' }, { key: 'cashfree_secret_key' },
        { key: 'cashfree_webhook_secret' }, { key: 'cashfree_env' },
      ],
    });
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const appId = db.cashfree_app_id || this.config.get<string>('cashfree.appId');
    const secretKey = db.cashfree_secret_key || this.config.get<string>('cashfree.secretKey');
    const webhookSecret = db.cashfree_webhook_secret || this.config.get<string>('cashfree.webhookSecret');
    const env = db.cashfree_env || this.config.get<string>('cashfree.env') || 'sandbox';
    const baseUrl = env === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
    return { appId, secretKey, webhookSecret, env, baseUrl };
  }

  // Exposed so PaymentService's public /payment/config response tells the
  // client SDK the currently-active environment, including any admin override.
  async getEnv(): Promise<string> {
    return (await this.getConfig()).env;
  }

  private async getClient(): Promise<AxiosInstance> {
    const { appId, secretKey, baseUrl } = await this.getConfig();
    if (!appId || !secretKey) {
      throw new InternalServerErrorException('Cashfree is not configured');
    }
    return axios.create({
      baseURL: baseUrl,
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': API_VERSION,
        'Content-Type': 'application/json',
      },
    });
  }

  async createOrder(
    userId: number,
    amountRupees: number,
    currency = 'INR',
    receipt?: string,
    customer?: CashfreeCustomer,
  ): Promise<CashfreeOrder> {
    if (!(amountRupees >= 1)) {
      throw new BadRequestException('amount must be at least ₹1');
    }
    const orderId = receipt ?? `adslife_u${userId}_${Date.now()}`;

    try {
      const client = await this.getClient();
      const { data } = await client.post('/orders', {
        order_id: orderId,
        order_amount: Math.round(amountRupees * 100) / 100,
        order_currency: currency,
        customer_details: {
          customer_id: String(userId),
          customer_name: customer?.name || `user_${userId}`,
          customer_email: customer?.email || 'no-reply@adslife.in',
          customer_phone: customer?.phone || '9999999999',
        },
      });
      return {
        order_id: data.order_id,
        payment_session_id: data.payment_session_id,
        amount: data.order_amount,
        currency: data.order_currency,
      };
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.message ?? e?.message ?? 'unknown error';
      this.logger.error(`Cashfree order creation failed: ${detail}`);
      if (status === 401) {
        throw new InternalServerErrorException('Cashfree authentication failed — check API keys');
      }
      throw new InternalServerErrorException(`Could not create payment order: ${detail}`);
    }
  }

  /**
   * Authoritative order-status re-check — this REPLACES Razorpay's
   * client-submitted HMAC signature verification. The frontend never hands
   * back anything cryptographic; we just ask Cashfree directly whether the
   * order actually got paid.
   */
  async getOrderStatus(orderId: string): Promise<CashfreeOrderStatus> {
    if (!orderId) {
      throw new BadRequestException('order_id is required');
    }
    try {
      const client = await this.getClient();
      const { data } = await client.get(`/orders/${encodeURIComponent(orderId)}`);
      let cfPaymentId: string | null = null;
      if (data.order_status === 'PAID') {
        try {
          const { data: payments } = await client.get(
            `/orders/${encodeURIComponent(orderId)}/payments`,
          );
          const success = (payments as any[]).find((p) => p.payment_status === 'SUCCESS');
          cfPaymentId = success?.cf_payment_id != null ? String(success.cf_payment_id) : null;
        } catch {
          // Order is PAID regardless of whether we could fetch the payment
          // leg's id — don't fail the whole status check over it.
        }
      }
      return { orderStatus: data.order_status, cfPaymentId };
    } catch (e: any) {
      const detail = e?.response?.data?.message ?? e?.message ?? 'unknown error';
      this.logger.error(`Cashfree order status fetch failed for ${orderId}: ${detail}`);
      throw new InternalServerErrorException(`Could not check payment status: ${detail}`);
    }
  }

  // No refund path existed anywhere in the app under Razorpay either — same
  // gap, now closed against Cashfree's refund API instead.
  async refund(orderId: string, refundId: string, amountRupees?: number) {
    try {
      const client = await this.getClient();
      const { data } = await client.post(`/orders/${encodeURIComponent(orderId)}/refunds`, {
        refund_id: refundId,
        ...(amountRupees != null ? { refund_amount: amountRupees } : {}),
      });
      return { refund_id: data.refund_id, status: data.refund_status, amount: data.refund_amount };
    } catch (e: any) {
      const detail = e?.response?.data?.message ?? e?.message ?? 'unknown error';
      this.logger.error(`Cashfree refund failed for order ${orderId}: ${detail}`);
      throw new InternalServerErrorException(`Refund failed: ${detail}`);
    }
  }

  /**
   * Cashfree webhook signature: Base64(HMAC-SHA256(timestamp + rawBody, webhookSecret)).
   * Uses the dedicated webhook secret configured in the Cashfree dashboard's
   * webhook settings (CASHFREE_WEBHOOK_SECRET) — a different value from the
   * API client secret (CASHFREE_SECRET_KEY) used to authenticate outbound
   * calls. Distinct from Razorpay's HMAC(order_id|payment_id) — this signs
   * the whole raw payload plus a timestamp, which main.ts already captures
   * correctly for this route (raw body + x-webhook-timestamp/
   * x-webhook-signature headers were already wired for this exact scheme).
   */
  async verifyWebhookSignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
    const { webhookSecret } = await this.getConfig();
    if (!webhookSecret || !timestamp || !signature) return false;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(timestamp + rawBody)
      .digest('base64');
    return (
      expected.length === signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    );
  }
}
