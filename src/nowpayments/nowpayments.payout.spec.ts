import { NowpaymentsService } from './nowpayments.service';

describe('NowpaymentsService payout helpers', () => {
  const make = (secret?: string) =>
    new NowpaymentsService({
      get: (k: string) => (k === 'NOWPAYMENTS_2FA_SECRET' ? secret : undefined),
    } as any);

  it('generates RFC 6238 TOTP codes from NOWPAYMENTS_2FA_SECRET', () => {
    // RFC 6238 SHA1 vector: secret "12345678901234567890", T=59s -> 94287082
    expect(
      make('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').generatePayoutVerificationCode(
        59_000,
      ),
    ).toBe('287082');
  });

  it('returns null when no 2FA secret is configured', () => {
    expect(make(undefined).generatePayoutVerificationCode()).toBeNull();
  });

  it('finds an existing payout by unique_external_id', async () => {
    const svc = make();
    (svc as any).payoutRequest = jest.fn().mockResolvedValue({
      payouts: [
        {
          batch_withdrawal_id: 'b-9',
          withdrawals: [{ unique_external_id: 'ref-1', status: 'SENDING' }],
        },
      ],
    });
    await expect(svc.findPayoutByExternalId('ref-1')).resolves.toMatchObject({
      id: 'b-9',
      status: 'SENDING',
    });
    await expect(svc.findPayoutByExternalId('ref-2')).resolves.toBeNull();
  });
});
