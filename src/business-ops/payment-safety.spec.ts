import { GoneException } from '@nestjs/common';
import { BusinessWebCheckoutService } from './business-web-checkout.service';
import { ApiPayoutsService } from '../business-api/api-payouts.service';

function makeCheckout(over: any = {}) {
  const prisma: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    business_web_checkouts: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    transactions: { findUnique: jest.fn().mockResolvedValue({ amount: 50 }) },
    business_payments: { create: jest.fn() },
    business_payment_links: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'l1', business_id: 'biz', code: 'C1', title: 'T', amount: 50,
        is_active: true, use_count: 0, max_uses: 1,
      }),
    },
    business_invoices: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'i1', business_id: 'biz', invoice_number: 'INV-1', status: 'sent', total: 50,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    businesses: { findUnique: jest.fn().mockResolvedValue({ merchant_id: 'm1' }) },
    business_payment_exceptions: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
  const commerce: any = {
    businessName: jest.fn().mockResolvedValue({ trading_name: 'Shop' }),
    linkState: jest.fn().mockReturnValue('active'),
  };
  const qr: any = {
    initialize: jest.fn().mockResolvedValue({ data: { authorization_url: 'https://pay.example/x', reference: 'QR-1' } }),
    verify: jest.fn().mockResolvedValue({ data: { status: 'completed' } }),
  };
  const currency: any = { getCurrentRate: jest.fn().mockResolvedValue({ farm_kes_rate: 1 }) };
  const webhooks: any = { emit: jest.fn() };
  const svc = new BusinessWebCheckoutService(prisma, commerce, qr, currency, webhooks);
  return { svc, prisma, qr, webhooks };
}

describe('Web checkout: claims before the payer is charged', () => {
  it('takes a link use atomically before sending the payer to the provider', async () => {
    const { svc, prisma, qr } = makeCheckout();
    await svc.start('link', 'C1', 'mpesa', 'a@b.co');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(qr.initialize.mock.invocationCallOrder[0]);
    expect(prisma.business_web_checkouts.create.mock.calls[0][0].data).toMatchObject({ reserved: true });
  });

  it('refuses a second payer when the last link use is taken (no provider call)', async () => {
    const { svc, prisma, qr } = makeCheckout();
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(svc.start('link', 'C1', 'mpesa')).rejects.toBeInstanceOf(GoneException);
    expect(qr.initialize).not.toHaveBeenCalled();
  });

  it('holds an invoice exclusively; a concurrent payer is refused', async () => {
    const { svc, prisma, qr } = makeCheckout();
    prisma.business_invoices.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.start('invoice', 'INV-1', 'card')).rejects.toThrow(/already being paid/);
    expect(qr.initialize).not.toHaveBeenCalled();
  });

  it('gives the reservation back if the provider cannot start', async () => {
    const { svc, prisma, qr } = makeCheckout();
    qr.initialize.mockRejectedValue(new Error('down'));
    await expect(svc.start('link', 'C1', 'mpesa')).rejects.toThrow('down');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2); // reserve + release
  });

  it('releases the hold when the provider reports failure', async () => {
    const { svc, prisma, qr } = makeCheckout();
    qr.verify.mockResolvedValue({ data: { status: 'failed' } });
    prisma.business_web_checkouts.findUnique.mockResolvedValue({
      id: 'c1', status: 'pending', reserved: true, source: 'invoice', source_id: 'i1', transaction_reference: 'QR-1',
    });
    expect(await svc.reconcile('QR-1')).toBe('failed');
    expect(prisma.business_invoices.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', payment_hold_ref: 'c1' },
      data: { payment_hold_ref: null, payment_hold_until: null },
    });
  });

  it('expires a stale pending checkout and frees the link use', async () => {
    const { svc, prisma, qr } = makeCheckout();
    qr.verify.mockResolvedValue({ data: { status: 'pending' } });
    prisma.business_web_checkouts.findUnique.mockResolvedValue({
      id: 'c1', status: 'pending', reserved: true, source: 'payment_link', source_id: 'l1',
      transaction_reference: 'QR-1', expires_at: new Date(Date.now() - 1000),
    });
    expect(await svc.reconcile('QR-1')).toBe('expired');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('a payment completing after its hold expired re-claims, or is recorded for refund', async () => {
    const { svc, prisma, webhooks } = makeCheckout();
    prisma.business_web_checkouts.findUnique.mockResolvedValue({
      id: 'c1', business_id: 'biz', status: 'expired', reserved: true, source: 'payment_link',
      source_id: 'l1', amount: 50, transaction_reference: 'QR-1',
    });
    prisma.$executeRaw.mockResolvedValue(0); // no uses left
    expect(await svc.reconcile('QR-1')).toBe('completed');
    expect(prisma.business_payment_exceptions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transaction_reference: 'QR-1', source: 'payment_link' }),
    });
    expect(webhooks.emit).not.toHaveBeenCalledWith('biz', 'live', 'payment_link.paid', expect.anything());
  });

  it('an invoice already paid in the app records the web payment for refund', async () => {
    const { svc, prisma } = makeCheckout();
    prisma.business_web_checkouts.findUnique.mockResolvedValue({
      id: 'c1', business_id: 'biz', status: 'pending', reserved: true, source: 'invoice',
      source_id: 'i1', amount: 50, transaction_reference: 'QR-1',
    });
    prisma.business_invoices.updateMany.mockResolvedValue({ count: 0 });
    await svc.reconcile('QR-1');
    expect(prisma.business_payment_exceptions.create).toHaveBeenCalled();
  });
});

describe('API live payouts: automatic, idempotent', () => {
  const ctx = { businessId: 'biz', ownerUserId: 'owner', keyId: 'k1' };
  const dto: any = { amount: 5000, method: 'MOBILE_MONEY', phone_number: '0712345678', account_name: 'A' };
  function make() {
    const prisma: any = {
      businesses: {
        findUnique: jest.fn().mockResolvedValue({ status: 'approved', merchant: { status: 'approved' } }),
      },
      business_api_payouts: {
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      audit_logs: { create: jest.fn().mockResolvedValue({}) },
    };
    const withdraw: any = {
      createWithdrawal: jest.fn().mockResolvedValue({
        reference: 'W1', withdrawal: { id: 'w', amount: 5000, fee: 75, settlement: 4925 },
      }),
    };
    const webhooks: any = { emit: jest.fn() };
    return { svc: new ApiPayoutsService(prisma, withdraw, webhooks), prisma, withdraw, webhooks };
  }

  it('requires an Idempotency-Key', async () => {
    const { svc, withdraw } = make();
    await expect(svc.create(ctx, dto)).rejects.toThrow(/Idempotency-Key/);
    expect(withdraw.createWithdrawal).not.toHaveBeenCalled();
  });

  it('goes through the normal automatic withdrawal pipeline, pre-authorised by the key', async () => {
    const { svc, withdraw, prisma } = make();
    const r = await svc.create(ctx, dto, 'idem-key-0001');
    expect(withdraw.createWithdrawal).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ amount: 5000, method: 'MOBILE_MONEY', phoneNumber: '0712345678' }),
      { preAuthorized: 'business_api_key:k1' },
    );
    expect(r.data.reference).toBe('W1');
    expect(prisma.business_api_payouts.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'submitted' }) }),
    );
  });

  it('replays the stored result for a repeated key without paying twice', async () => {
    const { svc, prisma, withdraw } = make();
    prisma.business_api_payouts.create.mockRejectedValue({ code: 'P2002' });
    prisma.business_api_payouts.findUnique.mockResolvedValue({
      id: 'p1', status: 'submitted', request_hash: ApiPayoutsService.hash(dto), response: { data: { reference: 'W1' } },
    });
    const r: any = await svc.create(ctx, dto, 'idem-key-0001');
    expect(r.idempotent_replay).toBe(true);
    expect(withdraw.createWithdrawal).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different body, and an in-flight duplicate', async () => {
    const { svc, prisma } = make();
    prisma.business_api_payouts.create.mockRejectedValue({ code: 'P2002' });
    prisma.business_api_payouts.findUnique.mockResolvedValue({ id: 'p1', status: 'submitted', request_hash: 'other' });
    await expect(svc.create(ctx, dto, 'idem-key-0001')).rejects.toThrow(/different request/);
    prisma.business_api_payouts.findUnique.mockResolvedValue({
      id: 'p1', status: 'processing', request_hash: ApiPayoutsService.hash(dto),
    });
    await expect(svc.create(ctx, dto, 'idem-key-0001')).rejects.toThrow(/still being processed/);
  });

  it('marks the key failed when the withdrawal is refused (limits, balance, address)', async () => {
    const { svc, prisma, withdraw } = make();
    withdraw.createWithdrawal.mockRejectedValue(new Error('Daily withdrawal limit reached'));
    await expect(svc.create(ctx, dto, 'idem-key-0001')).rejects.toThrow(/Daily/);
    expect(prisma.business_api_payouts.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
  });

  it('needs an approved business and merchant', async () => {
    const { svc, prisma } = make();
    prisma.businesses.findUnique.mockResolvedValue({ status: 'approved', merchant: { status: 'pending' } });
    await expect(svc.create(ctx, dto, 'idem-key-0001')).rejects.toThrow(/approved/);
  });
});

describe('Dashboard payouts: automatic (Owner/Finance + PIN, no admin step)', () => {
  const dto: any = { amount: 5000, method: 'MOBILE_MONEY', phone_number: '0712345678', account_name: 'A', pin: '1234' };
  function make(role = 'finance') {
    const prisma: any = {
      businesses: { findUnique: jest.fn().mockResolvedValue({ status: 'approved', merchant: { status: 'approved' } }) },
      business_api_payouts: {
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      audit_logs: { create: jest.fn().mockResolvedValue({}) },
    };
    const withdraw: any = { createWithdrawal: jest.fn().mockResolvedValue({ reference: 'W2', withdrawal: { amount: 5000 } }) };
    const svc = new ApiPayoutsService(prisma, withdraw, { emit: jest.fn() } as any);
    const { can } = jest.requireActual('./permissions');
    const access = {
      resolve: jest.fn(async (_u: string, p: any) => {
        if (!can(role, p)) throw new Error('Your business role does not allow this action');
        return { role, business: { id: 'biz', owner_user_id: 'owner' } };
      }),
    };
    const verifyPin = jest.fn().mockResolvedValue(true);
    return { svc, prisma, withdraw, access, verifyPin };
  }
  it('finance member with PIN triggers an automatic withdrawal from the owner wallet', async () => {
    const m = make('finance');
    const r: any = await m.svc.createFromDashboard(m.access, m.verifyPin, 'fin', dto, 'dash_12345678');
    expect(m.verifyPin).toHaveBeenCalledWith('fin', '1234');
    const [owner, body, opts] = m.withdraw.createWithdrawal.mock.calls[0];
    expect(owner).toBe('owner');
    expect(body).not.toHaveProperty('pin');
    expect(opts.preAuthorized).toBe('business_member_pin:fin');
    expect(m.prisma.business_api_payouts.create.mock.calls[0][0].data).toMatchObject({ source: 'dashboard', api_key_id: null });
    expect(r.data.reference).toBe('W2');
  });
  it('admin/operations roles cannot pay out', async () => {
    for (const role of ['admin', 'operations', 'accountant', 'developer']) {
      const m = make(role);
      await expect(m.svc.createFromDashboard(m.access, m.verifyPin, 'x', dto, 'dash_12345678')).rejects.toThrow('role');
      expect(m.withdraw.createWithdrawal).not.toHaveBeenCalled();
    }
  });
  it('wrong PIN stops before any money moves', async () => {
    const m = make('owner');
    m.verifyPin.mockRejectedValue(new Error('Invalid PIN'));
    await expect(m.svc.createFromDashboard(m.access, m.verifyPin, 'o', dto, 'dash_12345678')).rejects.toThrow('PIN');
    expect(m.prisma.business_api_payouts.create).not.toHaveBeenCalled();
  });
});
