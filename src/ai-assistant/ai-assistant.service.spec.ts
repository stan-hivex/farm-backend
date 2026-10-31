import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiProvider } from './ai-provider';
import { AiToolsService } from './ai-tools.service';

const U = 'user-1';
function mkPrisma(perm: any = null, committed = 0) {
  const store: any = { req: null };
  return {
    store,
    ai_spend_permissions: {
      findUnique: jest.fn().mockResolvedValue(perm),
      upsert: jest.fn(),
    },
    ai_action_requests: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: committed } }),
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'req-1',
        created_at: new Date(),
        ...data,
      })),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }) =>
          store.req &&
          where.user_id === store.req.user_id &&
          where.id === store.req.id
            ? store.req
            : null,
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ai_audit_log: { create: jest.fn(), findMany: jest.fn() },
    ai_messages: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'm', ...data })),
    },
    ai_conversations: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as any;
}
const cfg = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as any;
const ON = { AI_ASSISTANT_ENABLED: 'true', AI_API_KEY: 'k' };
const PERM = {
  enabled: true,
  revoked_at: null,
  per_tx_cap: 1000,
  daily_cap: 2000,
  allowed_actions: ['send_farm'],
  spend_categories: [
    'Hotels',
    'Flights',
    'Transport',
    'Shopping',
    'Bills',
    'Services',
    'Investments',
    'Crypto',
  ],
};

function mk(
  prisma: any,
  env = ON,
  provider?: any,
  wallets?: any,
  travel: any = { search: jest.fn(), offer: jest.fn(), enabled: () => true },
  agent: any = {
    payIntent: jest.fn(),
    publicIntent: jest.fn(),
    myRequests: jest.fn(),
  },
) {
  const p = provider ?? new AiProvider(cfg(env));
  return new AiAssistantService(
    prisma,
    p,
    new AiToolsService(prisma),
    wallets ?? { sendFunds: jest.fn() },
    cfg(env),
    travel,
    agent,
  );
}

describe('AiProvider', () => {
  it('is off unless enabled flag and all settings are present', () => {
    expect(new AiProvider(cfg({})).isConfigured()).toBe(false);
    expect(new AiProvider(cfg({ ...ON, AI_API_KEY: '' })).isConfigured()).toBe(
      false,
    );
    expect(
      new AiProvider(
        cfg({ ...ON, AI_ASSISTANT_ENABLED: 'false' }),
      ).isConfigured(),
    ).toBe(false);
    expect(new AiProvider(cfg(ON)).isConfigured()).toBe(true);
  });
});

describe('AiAssistantService', () => {
  it('chat returns 503 when not configured', async () => {
    await expect(
      mk(mkPrisma(), {} as any).chat(U, 'hi'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('enforces the daily message limit', async () => {
    const pr = mkPrisma();
    pr.ai_messages.count.mockResolvedValue(50);
    await expect(mk(pr).chat(U, 'hi')).rejects.toThrow('limit');
  });

  it('runs tools scoped to the caller and returns the reply', async () => {
    const pr = mkPrisma();
    pr.wallets = {
      findFirst: jest.fn().mockResolvedValue({
        currency: 'FARM',
        balance: 500,
        locked_balance: 0,
        is_frozen: false,
      }),
    };
    const provider = {
      isConfigured: () => true,
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 't1',
              type: 'function',
              function: {
                name: 'get_wallet',
                arguments: '{"user_id":"someone-else"}',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          role: 'assistant',
          content: 'You have 500 FARM.',
        }),
    };
    const out = await mk(pr, ON, provider).chat(U, 'balance?');
    expect(pr.wallets.findFirst).toHaveBeenCalledWith({
      where: { user_id: U, is_active: true },
    });
    expect(out.message.content).toBe('You have 500 FARM.');
    const toolMsg = provider.complete.mock.calls[1][0].find(
      (m: any) => m.role === 'tool',
    );
    expect(JSON.parse(toolMsg.content).available).toBe(500);
  });

  it('propose_payment via chat only creates a pending request', async () => {
    const pr = mkPrisma(PERM);
    const wallets = { sendFunds: jest.fn() };
    const provider = {
      isConfigured: () => true,
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 't',
              type: 'function',
              function: {
                name: 'propose_payment',
                arguments: '{"recipient_identifier":"jane","amount":100}',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          role: 'assistant',
          content: 'Please confirm in the app.',
        }),
    };
    const out = await mk(pr, ON, provider, wallets).chat(U, 'send jane 100');
    expect(out.pending_actions).toHaveLength(1);
    expect(wallets.sendFunds).not.toHaveBeenCalled();
  });

  it.each([
    ['no permissions', null, 10, 0],
    ['disabled', { ...PERM, enabled: false }, 10, 0],
    ['revoked', { ...PERM, revoked_at: new Date() }, 10, 0],
    ['not allowlisted', { ...PERM, allowed_actions: [] }, 10, 0],
    ['over per-tx cap', PERM, 1001, 0],
    ['over daily cap', PERM, 600, 1500],
  ])('rejects proposals when %s', async (_n, perm, amount, committed) => {
    await expect(
      mk(mkPrisma(perm, committed)).proposePayment(U, {
        recipient_identifier: 'jane',
        amount,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates permission updates', async () => {
    const s = mk(mkPrisma());
    await expect(
      s.updatePermissions(U, {
        enabled: true,
        per_tx_cap: 10,
        daily_cap: 5,
        allowed_actions: ['send_farm'],
      }),
    ).rejects.toThrow();
    await expect(
      s.updatePermissions(U, {
        enabled: true,
        per_tx_cap: 1,
        daily_cap: 5,
        allowed_actions: ['approve_business'],
      }),
    ).rejects.toThrow('Unknown action');
  });

  it('confirm requires the owner, executes via WalletsService with the PIN, and audits', async () => {
    const pr = mkPrisma(PERM);
    pr.store.req = {
      id: 'req-1',
      action: 'send_farm',
      user_id: U,
      status: 'pending',
      amount: 100,
      recipient_identifier: 'jane',
      description: null,
      expires_at: new Date(Date.now() + 60000),
      created_at: new Date(),
    };
    const wallets = {
      sendFunds: jest
        .fn()
        .mockResolvedValue({ data: { transaction_reference: 'TX1' } }),
    };
    const s = mk(pr, ON, undefined, wallets);
    await expect(
      s.confirmAction('other', 'req-1', '1234', ''),
    ).rejects.toBeInstanceOf(NotFoundException);
    const r = await s.confirmAction(U, 'req-1', '1234', '1.1.1.1');
    expect(wallets.sendFunds).toHaveBeenCalledWith(
      U,
      expect.objectContaining({
        recipient_identifier: 'jane',
        amount: 100,
        pin: '1234',
      }),
      '1.1.1.1',
    );
    expect(wallets.sendFunds.mock.calls[0][1].biometric_auth).toBeUndefined();
    expect(r).toEqual({
      id: 'req-1',
      status: 'executed',
      transaction_ref: 'TX1',
    });
    expect(pr.ai_audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'action_executed' }),
      }),
    );
  });

  it('confirm re-checks caps and puts request back to pending on failure', async () => {
    const pr = mkPrisma({ ...PERM, enabled: false });
    pr.store.req = {
      id: 'req-1',
      action: 'send_farm',
      user_id: U,
      status: 'pending',
      amount: 100,
      recipient_identifier: 'jane',
      expires_at: new Date(Date.now() + 60000),
      created_at: new Date(),
    };
    await expect(
      mk(pr).confirmAction(U, 'req-1', '1234', ''),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const pr2 = mkPrisma(PERM);
    pr2.store.req = { ...pr.store.req };
    const wallets = {
      sendFunds: jest.fn().mockRejectedValue(new Error('Invalid PIN')),
    };
    await expect(
      mk(pr2, ON, undefined, wallets).confirmAction(U, 'req-1', '0000', ''),
    ).rejects.toThrow('Invalid PIN');
    expect(pr2.ai_action_requests.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'pending', failure_reason: 'Invalid PIN' },
    });
  });

  it('revoke disables and cancels pending requests', async () => {
    const pr = mkPrisma();
    await mk(pr).revokePermissions(U);
    expect(pr.ai_action_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: U, status: 'pending' } }),
    );
  });
});

describe('Mkulima pay_intent (Phase 9)', () => {
  const IID = '11111111-1111-1111-1111-111111111111';
  const intent = {
    id: IID,
    business_name: 'Shamba Ltd',
    amount: 500,
    status: 'requires_payment',
    description: 'Seeds',
    expires_at: new Date(Date.now() + 3600e3),
  };
  it('proposes only when pay_intent is allowed and within caps', async () => {
    const agent = {
      publicIntent: jest.fn().mockResolvedValue(intent),
      payIntent: jest.fn(),
    };
    const pr = mkPrisma(PERM);
    const svc = mk(pr, ON, undefined, undefined, undefined, agent);
    await expect(
      svc.proposeIntent(U, { payment_intent_id: IID }),
    ).rejects.toThrow('Paying businesses is not an allowed AI action');
    pr.ai_spend_permissions.findUnique.mockResolvedValue({
      ...PERM,
      allowed_actions: ['pay_intent'],
      per_tx_cap: 100,
    });
    await expect(
      svc.proposeIntent(U, { payment_intent_id: IID }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    pr.ai_spend_permissions.findUnique.mockResolvedValue({
      ...PERM,
      allowed_actions: ['pay_intent'],
    });
    const r = await svc.proposeIntent(U, { payment_intent_id: IID });
    expect(r.action).toBe('pay_intent');
    expect(r.amount).toBe(500);
    expect(agent.payIntent).not.toHaveBeenCalled();
  });
  it('confirm pays the intent with the PIN via AgentPaymentsService', async () => {
    const agent = {
      publicIntent: jest.fn(),
      payIntent: jest
        .fn()
        .mockResolvedValue({ amount: 500, transaction_reference: 'TX1' }),
    };
    const pr = mkPrisma({ ...PERM, allowed_actions: ['pay_intent'] });
    pr.store.req = {
      id: 'req-1',
      action: 'pay_intent',
      user_id: U,
      status: 'pending',
      amount: 500,
      payload: { payment_intent_id: IID },
      expires_at: new Date(Date.now() + 60e3),
      created_at: new Date(),
    };
    const wallets = { sendFunds: jest.fn() };
    const svc = mk(pr, ON, undefined, wallets, undefined, agent);
    const r = await svc.confirmAction(U, 'req-1', '1234', 'ip');
    expect(agent.payIntent).toHaveBeenCalledWith(
      U,
      IID,
      '1234',
      'ip',
      'mkulima',
    );
    expect(wallets.sendFunds).not.toHaveBeenCalled();
    expect(r.transaction_ref).toBe('TX1');
  });
});

describe('Mkulima spending categories & activity (gap fix)', () => {
  const IID = '11111111-1111-1111-1111-111111111111';
  const intent = {
    id: IID,
    business_name: 'Shamba Ltd',
    amount: 500,
    status: 'requires_payment',
    description: 'Seeds',
    expires_at: new Date(Date.now() + 3600e3),
  };
  it('blocks a payment whose category is turned off', async () => {
    const agent = {
      publicIntent: jest.fn().mockResolvedValue(intent),
      payIntent: jest.fn(),
    };
    const pr = mkPrisma({
      ...PERM,
      allowed_actions: ['pay_intent'],
      spend_categories: ['Flights'],
    });
    const svc = mk(pr, ON, undefined, undefined, undefined, agent);
    await expect(
      svc.proposeIntent(U, { payment_intent_id: IID }),
    ).rejects.toThrow('Services is turned off');
  });
  it('rejects unknown categories', async () => {
    const svc = mk(mkPrisma(PERM));
    await expect(
      svc.updatePermissions(U, {
        enabled: true,
        per_tx_cap: 1,
        daily_cap: 2,
        allowed_actions: [],
        spend_categories: ['Casino'],
      }),
    ).rejects.toThrow('Unknown category');
  });
  it('maps requests and bookings to the activity shape and statuses', async () => {
    const pr = mkPrisma(PERM);
    const now = new Date();
    pr.ai_action_requests.findMany.mockResolvedValue([
      {
        id: 'a1',
        action: 'pay_intent',
        status: 'pending',
        amount: 5,
        recipient_identifier: 'Shamba',
        description: 'Seeds',
        expires_at: new Date(Date.now() + 6e4),
        created_at: now,
      },
      {
        id: 'a2',
        action: 'book_flight',
        status: 'executed',
        amount: 900,
        recipient_identifier: 'NBO-MBA',
        transaction_ref: 'TX1',
        expires_at: now,
        created_at: now,
      },
      {
        id: 'a3',
        action: 'send_farm',
        status: 'rejected',
        amount: 1,
        recipient_identifier: 'bob',
        expires_at: now,
        created_at: now,
      },
    ]);
    pr.travel_bookings = {
      findMany: jest.fn().mockResolvedValue([
        {
          ai_action_id: 'a2',
          provider: 'pkfare',
          total_farm: 950,
          booking_reference: 'ABC123',
          status: 'failed_refunded',
        },
      ]),
    };
    const a = await mk(pr).activity(U);
    expect(a.map((x: any) => x.status)).toEqual([
      'Awaiting Approval',
      'Refunded',
      'Cancelled',
    ]);
    expect(a[1]).toMatchObject({
      provider: 'pkfare',
      amount: 950,
      booking_ref: 'ABC123',
      confirmation: 'TX1',
      refund_status: 'Refunded',
      payment_method: 'FARM wallet',
      category: 'Flights',
    });
  });
});

describe('Mkulima hotel booking + flights availability', () => {
  const PERM_H = {
    ...PERM,
    per_tx_cap: 20000,
    daily_cap: 50000,
    allowed_actions: ['send_farm', 'book_hotel'],
  };
  const hotels = (over: any = {}) => ({
    enabled: () => true,
    status: () => ({ enabled: true, provider: 'liteapi', sandbox: true }),
    search: jest.fn().mockResolvedValue([
      {
        id: 'off-2',
        hotel_name: 'B',
        room_name: 'R',
        refundable: true,
        price_farm: 9000,
        bookable: true,
      },
      {
        id: 'off-1',
        hotel_name: 'A',
        room_name: 'R',
        refundable: false,
        price_farm: 7000,
        bookable: true,
      },
      {
        id: 'off-x',
        hotel_name: 'X',
        room_name: 'R',
        price_farm: null,
        bookable: false,
      },
    ]),
    prebook: jest.fn().mockResolvedValue({
      prebook_id: 'pb_123',
      hotel_id: 'h1',
      checkin: '2026-12-10',
      checkout: '2026-12-12',
      price_farm: 7000,
      bookable: true,
      refundable: false,
      live_mode: false,
    }),
    info: jest.fn().mockResolvedValue({ name: 'Nairobi Test Hotel' }),
    book: jest
      .fn()
      .mockResolvedValue({ status: 'confirmed', booking_reference: 'CONF1' }),
    ...over,
  });
  function mkH(prisma: any, h: any, travel: any = { enabled: () => true }) {
    return new AiAssistantService(
      prisma,
      new AiProvider(cfg(ON)),
      new AiToolsService(prisma),
      { sendFunds: jest.fn() } as any,
      cfg(ON),
      travel,
      {
        payIntent: jest.fn(),
        publicIntent: jest.fn(),
        myRequests: jest.fn(),
      } as any,
      h,
    );
  }

  it('search returns only priced offers, cheapest first, with real prices', async () => {
    const s = mkH(mkPrisma(PERM_H), hotels());
    const r: any = await s.searchHotels({
      city_name: 'Nairobi',
      country_code: 'KE',
      checkin: '2026-12-10',
      checkout: '2026-12-12',
      adults: 1,
    });
    expect(r.offers.map((o: any) => o.offer_id)).toEqual(['off-1', 'off-2']);
    expect(r.offers[0].price_farm).toBe(7000);
  });
  it('search says not available when hotels are off, and handles empty results', async () => {
    const off = mkH(mkPrisma(PERM_H), hotels({ enabled: () => false }));
    expect(await off.searchHotels({})).toEqual({
      available: false,
      message: 'Hotels are not available yet.',
    });
    const empty = mkH(
      mkPrisma(PERM_H),
      hotels({ search: jest.fn().mockResolvedValue([]) }),
    );
    expect(((await empty.searchHotels({})) as any).offers).toEqual([]);
  });
  it('proposal prebooks, checks caps/permission and creates a pending book_hotel', async () => {
    const prisma = mkPrisma(PERM_H);
    const req: any = await mkH(prisma, hotels()).proposeHotel(
      U,
      { offer_id: 'off-1' },
      'c1',
    );
    expect(req.action).toBe('book_hotel');
    expect(req.amount).toBe(7000);
    expect(req.payload.prebook_id).toBe('pb_123');
    await expect(
      mkH(
        mkPrisma({ ...PERM_H, allowed_actions: ['send_farm'] }),
        hotels(),
      ).proposeHotel(U, { offer_id: 'off-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      mkH(
        mkPrisma({ ...PERM_H, spend_categories: ['Flights'] }),
        hotels(),
      ).proposeHotel(U, { offer_id: 'off-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('confirm books with PIN, profile guest and idempotency key; requires a PIN', async () => {
    const prisma = mkPrisma(PERM_H);
    prisma.users = {
      findUnique: jest.fn().mockResolvedValue({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'j@example.com',
        phone: '+254700000000',
      }),
    };
    prisma.store.req = {
      id: 'req-1',
      user_id: U,
      status: 'pending',
      action: 'book_hotel',
      amount: 7000,
      payload: { prebook_id: 'pb_123' },
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60000),
    };
    const h = hotels();
    const s = mkH(prisma, h);
    await expect(s.confirmAction(U, 'req-1', '', 'ip')).rejects.toThrow('PIN');
    const r: any = await s.confirmAction(U, 'req-1', '1234', 'ip');
    expect(r.status).toBe('executed');
    expect(r.transaction_ref).toBe('CONF1');
    expect(h.book).toHaveBeenCalledWith(
      U,
      expect.objectContaining({
        prebook_id: 'pb_123',
        expected_total_farm: 7000,
        idempotency_key: 'ai-req-1',
        pin: '1234',
        ai_action_id: 'req-1',
        guest: expect.objectContaining({
          first_name: 'Jane',
          email: 'j@example.com',
        }),
      }),
      'ip',
    );
  });
  it('cleans profile names for the provider (accents, digits)', async () => {
    const prisma = mkPrisma(PERM_H);
    prisma.users = {
      findUnique: jest.fn().mockResolvedValue({
        first_name: 'Wanjirũ2',
        last_name: "O'Neil",
        email: 'j@example.com',
        phone: '+254700000000',
      }),
    };
    prisma.store.req = {
      id: 'req-1',
      user_id: U,
      status: 'pending',
      action: 'book_hotel',
      amount: 7000,
      payload: { prebook_id: 'pb_123' },
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60000),
    };
    const h = hotels();
    await mkH(prisma, h).confirmAction(U, 'req-1', '1234', 'ip');
    expect(h.book.mock.calls[0][1].guest).toEqual(
      expect.objectContaining({ first_name: 'Wanjiru', last_name: "O'Neil" }),
    );
  });
  it('a refused booking (refunded) marks the action failed, not pending', async () => {
    const prisma = mkPrisma(PERM_H);
    prisma.users = {
      findUnique: jest.fn().mockResolvedValue({
        first_name: 'J',
        last_name: 'D',
        email: 'j@example.com',
        phone: '+254700000000',
      }),
    };
    prisma.store.req = {
      id: 'req-1',
      user_id: U,
      status: 'pending',
      action: 'book_hotel',
      amount: 7000,
      payload: { prebook_id: 'pb_123' },
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60000),
    };
    const s = mkH(
      prisma,
      hotels({
        book: jest.fn().mockResolvedValue({
          status: 'failed_refunded',
          failure_reason: 'sold out',
        }),
      }),
    );
    const r: any = await s.confirmAction(U, 'req-1', '1234', 'ip');
    expect(r.status).toBe('failed');
    expect(prisma.ai_action_requests.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
  it('search_flights tool says flights are not available when no provider is configured', async () => {
    const prisma = mkPrisma(PERM_H);
    const provider: any = {
      isConfigured: () => true,
      complete: jest
        .fn()
        .mockResolvedValueOnce({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 't1',
              type: 'function',
              function: {
                name: 'search_flights',
                arguments:
                  '{"origin":"NBO","destination":"MBA","departure_date":"2026-12-10","adults":1}',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          role: 'assistant',
          content: 'Flights are not available yet.',
        }),
    };
    const travel = { enabled: () => false, search: jest.fn() };
    const s = new AiAssistantService(
      prisma,
      provider,
      new AiToolsService(prisma),
      {} as any,
      cfg(ON),
      travel as any,
      {} as any,
      hotels(),
    );
    const r = await s.chat(U, 'flight to Mombasa');
    expect(travel.search).not.toHaveBeenCalled();
    const toolMsg = provider.complete.mock.calls[1][0].find(
      (m: any) => m.role === 'tool',
    );
    expect(JSON.parse(toolMsg.content)).toEqual({
      available: false,
      message: 'Flights are not available yet.',
    });
    expect(r.message.content).toContain('not available');
  });
});
