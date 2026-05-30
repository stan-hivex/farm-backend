import { WebhookSignatureGuard } from './webhook-signature.guard';
import { createHmac } from 'crypto';

describe('WebhookSignatureGuard', () => {
  it('verifies paystack signature successfully', () => {
    const secret = 'test_paystack_secret';
    const cfg = { get: (k: string) => (k === 'PAYSTACK_WEBHOOK_SECRET' ? secret : undefined) } as any;
    const guard = new WebhookSignatureGuard(cfg);

    const payload = { event: 'charge.success', id: 'evt_123', data: { reference: 'ref123' } };
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha512', secret).update(Buffer.from(raw)).digest('hex');

    const req: any = {
      path: '/webhooks/paystack',
      headers: { 'x-paystack-signature': sig },
      rawBody: Buffer.from(raw),
    };

    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('rejects when signature mismatch', () => {
    const secret = 'test_paystack_secret';
    const cfg = { get: (k: string) => (k === 'PAYSTACK_WEBHOOK_SECRET' ? secret : undefined) } as any;
    const guard = new WebhookSignatureGuard(cfg);

    const payload = { event: 'charge.success', id: 'evt_123', data: { reference: 'ref123' } };
    const raw = JSON.stringify(payload);
    const sig = 'deadbeef';

    const req: any = {
      path: '/webhooks/paystack',
      headers: { 'x-paystack-signature': sig },
      rawBody: Buffer.from(raw),
    };

    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(() => guard.canActivate(ctx as any)).toThrow();
  });
});
