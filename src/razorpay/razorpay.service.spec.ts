import * as crypto from 'crypto';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { RazorpayService } from './razorpay.service';

/**
 * The money path: HMAC signature verification for Razorpay checkout.
 * A regression here either blocks all payments or, far worse, accepts
 * forged ones — so it gets real tests.
 */
describe('RazorpayService.verifyPayment', () => {
  const KEY_SECRET = 'test_secret_key_for_hmac';
  let service: RazorpayService;

  const sign = (orderId: string, paymentId: string, secret = KEY_SECRET) =>
    crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    // Successful verification records the payment via dataSource.query —
    // stub it; signature math itself needs no DB.
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    service = new RazorpayService(dataSource as never);
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it('accepts a correctly signed order/payment pair', async () => {
    const sig = sign('order_ABC123', 'pay_XYZ789');
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', sig)).resolves.toBeDefined();
  });

  it('rejects a tampered signature', async () => {
    const sig = sign('order_ABC123', 'pay_XYZ789');
    const tampered = sig.slice(0, -2) + (sig.endsWith('00') ? '11' : '00');
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', tampered)).rejects.toThrow(BadRequestException);
  });

  it('rejects a signature for a different order (replay across orders)', async () => {
    const sigForOtherOrder = sign('order_OTHER', 'pay_XYZ789');
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', sigForOtherOrder)).rejects.toThrow(BadRequestException);
  });

  it('rejects a signature signed with the wrong secret (forged key)', async () => {
    const forged = sign('order_ABC123', 'pay_XYZ789', 'attacker_guess');
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', forged)).rejects.toThrow(BadRequestException);
  });

  it('rejects wrong-length signatures without throwing internal errors', async () => {
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', 'deadbeef')).rejects.toThrow(BadRequestException);
  });

  it('rejects when any field is missing', async () => {
    const sig = sign('order_ABC123', 'pay_XYZ789');
    await expect(service.verifyPayment('', 'pay_XYZ789', sig)).rejects.toThrow(BadRequestException);
    await expect(service.verifyPayment('order_ABC123', '', sig)).rejects.toThrow(BadRequestException);
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', '')).rejects.toThrow(BadRequestException);
  });

  it('fails closed when Razorpay is not configured', async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    const sig = sign('order_ABC123', 'pay_XYZ789');
    await expect(service.verifyPayment('order_ABC123', 'pay_XYZ789', sig)).rejects.toThrow(InternalServerErrorException);
  });
});
