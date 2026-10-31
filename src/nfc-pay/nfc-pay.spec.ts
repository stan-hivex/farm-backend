import { NfcPayService } from './nfc-pay.service';

const ID = '11111111-2222-3333-4444-555555555555';
function mk(row: any = null, opts: { merchant?: boolean } = {}) {
  const state = { row };
  const prisma: any = {
    users: {
      findUnique: jest.fn().mockResolvedValue({
        username: 'shop',
        first_name: 'Ann',
        last_name: 'K',
      }),
    },
    businesses: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.merchant ? { trading_name: 'Ann Shop' } : null),
    },
    nfc_payment_requests: {
      create: jest.fn(({ data }: any) => {
        state.row = {
          id: ID,
          ...data,
          used_at: null,
          payer_user_id: null,
          transaction_reference: null,
        };
        return state.row;
      }),
      findUnique: jest.fn(() => state.row),
      updateMany: jest.fn(({ where, data }: any) => {
        const r = state.row;
        if (!r) return { count: 0 };
        if ('used_at' in where && where.used_at === null && r.used_at)
          return { count: 0 };
        if (where.expires_at && r.expires_at <= new Date()) return { count: 0 };
        if (where.payer_user_id && r.payer_user_id !== where.payer_user_id)
          return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
      update: jest.fn(({ data }: any) => Object.assign(state.row, data)),
    },
    wallets: {
      findFirst: jest.fn().mockResolvedValue({ wallet_address: 'FARMPAYEE' }),
    },
  };
  const wallets: any = {
    sendFunds: jest
      .fn()
      .mockResolvedValue({ data: { transaction_reference: 'TX1', fee: 0 } }),
  };
  return { svc: new NfcPayService(prisma, wallets), prisma, wallets, state };
}

describe('NFC tap to pay', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.NFC_PAY_ENABLED = 'true';
    process.env.NFC_PAY_SECRET = 'test-secret-0123456789abcdef';
    delete process.env.FEE_TRANSFER_PCT;
    delete process.env.FEE_MERCHANT_PCT;
  });
  afterAll(() => (process.env = env));

  it('is off unless NFC_PAY_ENABLED=true', async () => {
    process.env.NFC_PAY_ENABLED = '';
    await expect(mk().svc.create('payee', { amount: 10 })).rejects.toThrow(
      'not enabled',
    );
  });

  it('creates a ~60s signed request; merchant kind shows 1% paid by the merchant', async () => {
    const { svc } = mk(null, { merchant: true });
    const r = (await svc.create('payee', { amount: 200 })).data;
    expect(r.token.startsWith('farmpay1.' + ID + '.')).toBe(true);
    expect(r.ttl_seconds).toBe(60);
    expect(r).toMatchObject({
      kind: 'merchant',
      payer_fee: 0,
      payer_total: 200,
      merchant_fee: 2,
      payee_receives: 198,
    });
  });

  it('p2p requests use the transfer rule (0%)', async () => {
    const r = (await mk().svc.create('payee', { amount: 50 })).data;
    expect(r).toMatchObject({ kind: 'p2p', payer_fee: 0, payer_total: 50 });
  });

  it('rejects tampered tokens (amount/id/expiry/signature)', async () => {
    const { svc } = mk();
    const t = (await svc.create('payee', { amount: 10 })).data.token;
    const [p, id, exp, sig] = t.split('.');
    expect(() => svc.verify(`${p}.${id}.${Number(exp) + 600}.${sig}`)).toThrow(
      'signature',
    );
    expect(() =>
      svc.verify(`${p}.${ID.replace('1', '9')}.${exp}.${sig}`),
    ).toThrow('signature');
    expect(() => svc.verify(`${p}.${id}.${exp}.${sig.slice(0, -2)}xx`)).toThrow(
      'signature',
    );
    expect(() => svc.verify('hello')).toThrow('Not a FARM');
    // Amount is never in the token: the payer always gets the DB amount.
    const res = (await svc.resolve('payer', t)).data;
    expect(res.amount).toBe(10);
  });

  it('expired requests cannot be resolved or paid', async () => {
    const { svc, wallets } = mk();
    const t = (await svc.create('payee', { amount: 10 })).data.token;
    expect(() => svc.verify(t, Date.now() + 61_000)).toThrow('expired');
    jest.useFakeTimers({ now: Date.now() + 61_000 });
    try {
      await expect(
        svc.pay('payer', { token: t, pin: '1234' }, ''),
      ).rejects.toThrow('expired');
    } finally {
      jest.useRealTimers();
    }
    expect(wallets.sendFunds).not.toHaveBeenCalled();
  });

  it('pays once using the stored amount; replay by the same payer is idempotent, others are refused', async () => {
    const { svc, wallets } = mk(null, { merchant: true });
    const t = (await svc.create('payee', { amount: 25 })).data.token;
    const a = await svc.pay('payer', { token: t, pin: '1234' }, '1.2.3.4');
    expect(a.data).toMatchObject({
      transaction_reference: 'TX1',
      replay: false,
    });
    expect(wallets.sendFunds).toHaveBeenCalledWith(
      'payer',
      expect.objectContaining({
        recipient_identifier: 'FARMPAYEE',
        amount: 25,
        pin: '1234',
      }),
      '1.2.3.4',
      { merchantFee: true },
    );
    const b = await svc.pay('payer', { token: t, pin: '1234' }, '');
    expect(b.data.replay).toBe(true);
    expect(wallets.sendFunds).toHaveBeenCalledTimes(1);
    await expect(svc.pay('other', { token: t, pin: '1' }, '')).rejects.toThrow(
      'already paid',
    );
    await expect(svc.resolve('other', t)).rejects.toThrow('already paid');
  });

  it('a failed payment (wrong PIN) releases the claim so it can be retried', async () => {
    const { svc, wallets, state } = mk();
    const t = (await svc.create('payee', { amount: 5 })).data.token;
    wallets.sendFunds.mockRejectedValueOnce(new Error('Invalid PIN'));
    await expect(
      svc.pay('payer', { token: t, pin: '0000' }, ''),
    ).rejects.toThrow('Invalid PIN');
    expect(state.row.used_at).toBeNull();
    const ok = await svc.pay('payer', { token: t, pin: '1234' }, '');
    expect(ok.data.transaction_reference).toBe('TX1');
  });

  it('you cannot pay your own request', async () => {
    const { svc } = mk();
    const t = (await svc.create('payee', { amount: 5 })).data.token;
    await expect(svc.pay('payee', { token: t }, '')).rejects.toThrow(
      'own request',
    );
  });
});
