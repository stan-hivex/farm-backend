import { PaystackService, paystackMockVerifyAllowed } from './paystack.service';

describe('Paystack verify without a secret key', () => {
  it('never reports success unless local mock is explicitly allowed', async () => {
    const svc: any = Object.create(PaystackService.prototype);
    svc.secretKey = '';
    svc.logger = { warn: jest.fn(), log: jest.fn() };
    const prev = process.env.PAYSTACK_MOCK_VERIFY;
    delete process.env.PAYSTACK_MOCK_VERIFY;
    const r = await svc.verifyTransaction('ref1');
    expect(r.status).not.toBe('success');
    process.env.PAYSTACK_MOCK_VERIFY = prev;
  });
  it('mock flag is ignored in production / on Render', () => {
    expect(
      paystackMockVerifyAllowed({
        PAYSTACK_MOCK_VERIFY: 'true',
        NODE_ENV: 'test',
      } as any),
    ).toBe(true);
    expect(
      paystackMockVerifyAllowed({
        PAYSTACK_MOCK_VERIFY: 'true',
        NODE_ENV: 'production',
      } as any),
    ).toBe(false);
    expect(
      paystackMockVerifyAllowed({
        PAYSTACK_MOCK_VERIFY: 'true',
        RENDER: 'true',
      } as any),
    ).toBe(false);
  });
});
