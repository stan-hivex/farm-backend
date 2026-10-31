import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AgentPaymentsService } from './agent-payments.service';

const BIZ = 'b0000000-0000-0000-0000-000000000001';
const OWNER = 'owner';
const PAYER = 'payer';
const future = () => new Date(Date.now() + 3600e3);

function mkPrisma() {
  const p: any = {
    intents: new Map<string, any>(),
    requests: new Map<string, any>(),
    businesses: {
      findUnique: jest.fn().mockResolvedValue({
        id: BIZ,
        trading_name: 'Shamba',
        legal_name: 'Shamba Ltd',
        owner_user_id: OWNER,
        status: 'approved',
      }),
    },
    payment_intents: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) =>
          where.id ? (p.intents.get(where.id) ?? null) : null,
        ),
      create: jest.fn().mockImplementation(({ data }) => {
        const i = {
          id: 'i' + (p.intents.size + 1),
          status: 'requires_payment',
          amount_refunded: 0,
          currency: 'FARM',
          created_at: new Date(),
          ...data,
        };
        p.intents.set(i.id, i);
        return i;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const i = { ...p.intents.get(where.id), ...data };
        p.intents.set(where.id, i);
        return i;
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment_refunds: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'r1',
        status: 'succeeded',
        created_at: new Date(),
        ...data,
      })),
      findMany: jest.fn(),
    },
    agent_authorizations: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'm1',
        status: 'active',
        created_at: new Date(),
        ...data,
      })),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    agent_payment_requests: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) =>
          where.id ? (p.requests.get(where.id) ?? null) : null,
        ),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => {
        const r = {
          id: 'q1',
          status: 'pending',
          created_at: new Date(),
          ...data,
        };
        p.requests.set(r.id, r);
        return r;
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const r = { ...p.requests.get(where.id), ...data };
        p.requests.set(where.id, r);
        return r;
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    business_payments: { create: jest.fn() },
    wallets: {
      findFirst: jest.fn().mockImplementation(({ where }) => ({
        id: where.user_id === OWNER ? 'wb' : 'wp',
        balance: 1000,
        is_frozen: false,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    transactions: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
    ledger_entries: { create: jest.fn() },
  };
  p.$transaction = jest.fn((fn: any) => fn(p));
  return p;
}
function mk(pr: any) {
  const auth = { verifyPin: jest.fn() };
  const wallets = {
    sendFunds: jest
      .fn()
      .mockResolvedValue({ data: { transaction_reference: 'TXREF' } }),
  };
  const access = {
    resolve: jest
      .fn()
      .mockResolvedValue({ business: { id: BIZ, owner_user_id: OWNER } }),
  };
  const finance = {
    walletFor: jest.fn().mockResolvedValue({ wallet_address: 'ADDR' }),
  };
  const webhooks = { emit: jest.fn() };
  return {
    svc: new AgentPaymentsService(
      pr,
      auth as any,
      wallets as any,
      access as any,
      finance as any,
      webhooks as any,
    ),
    auth,
    wallets,
    webhooks,
  };
}
const LIVE = {
  businessId: BIZ,
  ownerUserId: OWNER,
  actorUserId: null,
  live: true,
};

beforeEach(() => {
  process.env.AGENT_PAYMENTS_ENABLED = 'true';
});

describe('AgentPaymentsService', () => {
  it('is off unless AGENT_PAYMENTS_ENABLED', async () => {
    process.env.AGENT_PAYMENTS_ENABLED = 'false';
    const { svc } = mk(mkPrisma());
    expect(svc.status().enabled).toBe(false);
    await expect(svc.createIntent(LIVE, { amount: 10 })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates intents idempotently and validates amount', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr);
    await expect(svc.createIntent(LIVE, { amount: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const a = await svc.createIntent(
      LIVE,
      { amount: 250, description: 'Seeds' },
      'key-12345',
    );
    pr.payment_intents.findUnique.mockImplementation(({ where }: any) =>
      where.business_id_idempotency_key
        ? pr.intents.get(a.id)
        : pr.intents.get(where.id),
    );
    const b = await svc.createIntent(LIVE, { amount: 250 }, 'key-12345');
    expect(b.id).toBe(a.id);
    await expect(
      svc.createIntent(LIVE, { amount: 300 }, 'key-12345'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pays an intent through sendFunds with the PIN and records it', async () => {
    const pr = mkPrisma();
    const { svc, wallets, webhooks } = mk(pr);
    const i = await svc.createIntent(LIVE, { amount: 250 });
    pr.intents.get(i.id).expires_at = future();
    const r = await svc.payIntent(PAYER, i.id, '1234', 'ip');
    expect(wallets.sendFunds).toHaveBeenCalledWith(
      PAYER,
      expect.objectContaining({
        recipient_identifier: 'ADDR',
        amount: 250,
        pin: '1234',
      }),
      'ip',
    );
    expect(r.status).toBe('succeeded');
    expect(pr.business_payments.create).toHaveBeenCalled();
    expect(webhooks.emit).toHaveBeenCalledWith(
      BIZ,
      'live',
      'payment_intent.succeeded',
      expect.anything(),
    );
  });

  it('releases the intent when payment fails (e.g. wrong PIN) and blocks self-pay', async () => {
    const pr = mkPrisma();
    const { svc, wallets } = mk(pr);
    const i = await svc.createIntent(LIVE, { amount: 250 });
    wallets.sendFunds.mockRejectedValueOnce(
      new UnauthorizedException('Incorrect PIN'),
    );
    await expect(
      svc.payIntent(PAYER, i.id, '0000', 'ip'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(pr.payment_intents.updateMany).toHaveBeenLastCalledWith({
      where: { id: i.id, status: 'processing' },
      data: { status: 'requires_payment', payer_user_id: null },
    });
    await expect(
      svc.payIntent(OWNER, i.id, '1234', 'ip'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sandbox intents cannot be paid with real money', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr);
    const i = await svc.createIntent({ ...LIVE, live: false }, { amount: 10 });
    await expect(svc.payIntent(PAYER, i.id, '1234', 'ip')).rejects.toThrow(
      'Payment not found',
    );
  });

  it('refunds never exceed what was paid and move money atomically', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr);
    const i = await svc.createIntent(LIVE, { amount: 100 });
    Object.assign(pr.intents.get(i.id), {
      status: 'succeeded',
      payer_user_id: PAYER,
    });
    await expect(svc.refund(LIVE, i.id, { amount: 150 })).rejects.toThrow(
      'At most 100',
    );
    const r = await svc.refund(LIVE, i.id, { amount: 40, reason: 'damaged' });
    expect(r.amount).toBe(40);
    expect(pr.payment_intents.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { amount_refunded: 40, status: 'partially_refunded' },
      }),
    );
    expect(pr.wallets.updateMany).toHaveBeenCalledWith({
      where: { id: 'wb', balance: { gte: 40 } },
      data: { balance: { decrement: 40 } },
    });
    expect(pr.wallets.update).toHaveBeenCalledWith({
      where: { id: 'wp' },
      data: { balance: { increment: 40 } },
    });
    expect(pr.ledger_entries.create).toHaveBeenCalledTimes(2);
  });

  it('refund fails cleanly when the business balance is too low', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr);
    const i = await svc.createIntent(LIVE, { amount: 100 });
    Object.assign(pr.intents.get(i.id), {
      status: 'succeeded',
      payer_user_id: PAYER,
    });
    pr.wallets.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.refund(LIVE, i.id, {})).rejects.toThrow(
      'Insufficient business balance',
    );
  });

  it('mandates need the PIN and sane limits', async () => {
    const pr = mkPrisma();
    const { svc, auth } = mk(pr);
    const base = {
      business_id: BIZ,
      per_tx_cap: 500,
      daily_cap: 1000,
      monthly_cap: 5000,
      expires_in_days: 30,
      pin: '1234',
    };
    await expect(
      svc.createMandate(PAYER, { ...base, daily_cap: 100 }),
    ).rejects.toThrow('Daily limit');
    await expect(
      svc.createMandate(PAYER, { ...base, per_tx_cap: 1e9 }),
    ).rejects.toThrow('Per-payment limit');
    await expect(svc.createMandate(OWNER, base)).rejects.toThrow(
      'own business',
    );
    const m = await svc.createMandate(PAYER, base);
    expect(auth.verifyPin).toHaveBeenCalledWith(PAYER, '1234');
    expect(m.per_tx_cap).toBe(500);
  });

  describe('agent payment requests', () => {
    const mandate = (o: any = {}) => ({
      id: 'm1',
      user_id: PAYER,
      business_id: BIZ,
      status: 'active',
      per_tx_cap: 300,
      daily_cap: 500,
      monthly_cap: 2000,
      expires_at: future(),
      ...o,
    });
    it('rejects requests over the mandate caps, and sandbox keys', async () => {
      const pr = mkPrisma();
      const { svc } = mk(pr);
      const i = await svc.createIntent(LIVE, { amount: 400 });
      pr.intents.get(i.id).expires_at = future();
      pr.agent_authorizations.findUnique.mockResolvedValue(mandate());
      await expect(
        svc.createAgentRequest(
          { ...LIVE, live: false },
          { authorization_id: 'm1', payment_intent_id: i.id },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.createAgentRequest(LIVE, {
          authorization_id: 'm1',
          payment_intent_id: i.id,
        }),
      ).rejects.toThrow('per-payment limit');
      pr.agent_authorizations.findUnique.mockResolvedValue(
        mandate({ per_tx_cap: 400 }),
      );
      pr.agent_payment_requests.aggregate.mockResolvedValue({
        _sum: { amount: 200 },
      });
      await expect(
        svc.createAgentRequest(LIVE, {
          authorization_id: 'm1',
          payment_intent_id: i.id,
        }),
      ).rejects.toThrow('daily limit');
      pr.agent_authorizations.findUnique.mockResolvedValue(
        mandate({ status: 'revoked' }),
      );
      await expect(
        svc.createAgentRequest(LIVE, {
          authorization_id: 'm1',
          payment_intent_id: i.id,
        }),
      ).rejects.toThrow('not active');
    });

    it('creates a pending request; money moves only when the user confirms with PIN', async () => {
      const pr = mkPrisma();
      const { svc, wallets } = mk(pr);
      const i = await svc.createIntent(LIVE, { amount: 200 });
      pr.intents.get(i.id).expires_at = future();
      pr.agent_authorizations.findUnique.mockResolvedValue(mandate());
      const q = await svc.createAgentRequest(LIVE, {
        authorization_id: 'm1',
        payment_intent_id: i.id,
      });
      expect(q.status).toBe('pending');
      expect(wallets.sendFunds).not.toHaveBeenCalled();
      await expect(
        svc.confirmRequest('someone-else', q.id, '1234', 'ip'),
      ).rejects.toThrow('not found');
      const done = await svc.confirmRequest(PAYER, q.id, '1234', 'ip');
      expect(wallets.sendFunds).toHaveBeenCalledWith(
        PAYER,
        expect.objectContaining({ amount: 200, pin: '1234' }),
        'ip',
      );
      expect(done.status).toBe('confirmed');
      expect(done.transaction_reference).toBe('TXREF');
    });

    it('re-checks caps at confirm time and keeps the request retryable after a wrong PIN', async () => {
      const pr = mkPrisma();
      const { svc, wallets } = mk(pr);
      const i = await svc.createIntent(LIVE, { amount: 200 });
      pr.intents.get(i.id).expires_at = future();
      pr.agent_authorizations.findUnique.mockResolvedValue(mandate());
      const q = await svc.createAgentRequest(LIVE, {
        authorization_id: 'm1',
        payment_intent_id: i.id,
      });
      wallets.sendFunds.mockRejectedValueOnce(
        new UnauthorizedException('Incorrect PIN'),
      );
      await expect(
        svc.confirmRequest(PAYER, q.id, '0000', 'ip'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(pr.requests.get(q.id).status).toBe('pending');
      pr.agent_authorizations.findUnique.mockResolvedValue(
        mandate({ status: 'revoked' }),
      );
      await expect(
        svc.confirmRequest(PAYER, q.id, '1234', 'ip'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(pr.requests.get(q.id).status).toBe('failed');
    });

    it('expired requests cannot be confirmed', async () => {
      const pr = mkPrisma();
      const { svc } = mk(pr);
      pr.requests.set('q9', {
        id: 'q9',
        user_id: PAYER,
        status: 'pending',
        expires_at: new Date(Date.now() - 1000),
      });
      await expect(
        svc.confirmRequest(PAYER, 'q9', '1234', 'ip'),
      ).rejects.toBeInstanceOf(GoneException);
    });
  });
});
