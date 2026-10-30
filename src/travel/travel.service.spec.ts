import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { TravelService } from './travel.service';
import { DuffelProvider } from './duffel.provider';
import { ProviderRejectedError, ProviderUnknownError } from './travel-provider';

const U = 'u1';
const OFFER = {
  id: 'off_123456', provider: 'duffel', total_amount: 100, total_currency: 'USD', owner: 'Duffel Airways',
  slices: [{ origin: 'NBO', destination: 'MBA', segments: [] }], passengers: [{ id: 'pas_1' }], live_mode: false,
} as any;
const PAX = [{ id: 'pas_1', title: 'mr', given_name: 'John', family_name: 'Kamau', gender: 'm', born_on: '1990-01-01', email: 'j@example.com', phone_number: '+254700000000' }] as any;

function mkPrisma() {
  const p: any = {
    wallet: { id: 'w1', balance: 50000, locked_balance: 0, is_frozen: false },
    travel_bookings: {
      findUnique: jest.fn().mockImplementation(({ where }) => (where.id ? { id: 'b1', user_id: U, transaction_id: 't1', total_farm: 13260, status: 'payment_held' } : null)),
      findFirst: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'b1', created_at: new Date(), ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'b1', total_farm: 13260, offer_amount: 100, service_fee_farm: 0, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
    wallets: {
      findFirst: jest.fn().mockImplementation(() => p.wallet),
      findUnique: jest.fn().mockImplementation(() => p.wallet),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    transactions: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: data.transaction_type === 'escrow_refund' ? 'tR' : 't1', ...data })),
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 't1', sender_wallet_id: 'w1' }),
    },
    ledger_entries: { create: jest.fn() },
    ai_action_requests: { update: jest.fn(), findFirst: jest.fn(), aggregate: jest.fn() },
    ai_spend_permissions: { findUnique: jest.fn() },
  };
  p.$transaction = jest.fn((fn: any) => fn(p));
  return p;
}
function mk(prisma: any, flights: any = {}) {
  const f = { name: 'duffel', isConfigured: () => true, getOffer: jest.fn().mockResolvedValue(OFFER), searchFlights: jest.fn().mockResolvedValue([OFFER]), createOrder: jest.fn(), ...flights };
  const rates = { usdcKes: jest.fn().mockResolvedValue({ rate: 128, mid: 130 }) };
  const auth = { verifyPin: jest.fn() };
  return { svc: new TravelService(prisma, auth as any, rates as any, f as any), f, auth };
}
const dto = (o: any = {}) => ({ offer_id: OFFER.id, passengers: PAX, expected_total_farm: 13260, pin: '1234', idempotency_key: 'idem-key-1', ...o });

beforeEach(() => {
  process.env.TRAVEL_ENABLED = 'true';
  process.env.TRAVEL_FX_MARKUP_BPS = '200';
  delete process.env.TRAVEL_SERVICE_FEE_FARM;
});

describe('DuffelProvider', () => {
  it('needs a test token, or TRAVEL_ALLOW_LIVE for live', () => {
    expect(new DuffelProvider({}).isConfigured()).toBe(false);
    expect(new DuffelProvider({ DUFFEL_API_TOKEN: 'duffel_test_x' }).isConfigured()).toBe(true);
    expect(new DuffelProvider({ DUFFEL_API_TOKEN: 'duffel_live_x' }).isConfigured()).toBe(false);
    expect(new DuffelProvider({ DUFFEL_API_TOKEN: 'duffel_live_x', TRAVEL_ALLOW_LIVE: 'true' }).isConfigured()).toBe(true);
  });
  it('maps an offer', () => {
    const o = DuffelProvider.mapOffer({ id: 'off_1', total_amount: '45.00', total_currency: 'USD', owner: { name: 'BA' }, passengers: [{ id: 'pas_1', type: 'adult' }],
      slices: [{ origin: { iata_code: 'NBO' }, destination: { iata_code: 'MBA' }, segments: [{ origin: { iata_code: 'NBO' }, destination: { iata_code: 'MBA' }, marketing_carrier: { name: 'BA', iata_code: 'BA' }, marketing_carrier_flight_number: '12', departing_at: 'x', arriving_at: 'y' }] }],
      conditions: { refund_before_departure: { allowed: false } }, live_mode: false });
    expect(o.total_amount).toBe(45);
    expect(o.slices[0].segments[0].flight_number).toBe('BA12');
    expect(o.refundable).toBe(false);
  });
});

describe('TravelService', () => {
  it('is unavailable when not configured', async () => {
    process.env.TRAVEL_ENABLED = 'false';
    const { svc } = mk(mkPrisma());
    expect(svc.status().enabled).toBe(false);
    await expect(svc.search({ origin: 'NBO', destination: 'MBA', departure_date: '2099-01-01', adults: 1 })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('prices USD with mid + markup, KES 1:1, others unavailable', async () => {
    const { svc } = mk(mkPrisma());
    expect((await svc.priceFarm(100, 'USD'))!.total).toBe(13260);
    expect((await svc.priceFarm(5000, 'KES'))!.total).toBe(5000);
    expect(await svc.priceFarm(10, 'GBP')).toBeNull();
  });

  it('validates search input', () => {
    const { svc } = mk(mkPrisma());
    expect(() => svc.validateSearch({ origin: 'nbo', destination: 'NBO', departure_date: '2099-01-01', adults: 1 })).toThrow();
    expect(() => svc.validateSearch({ origin: 'NBO', destination: 'MBA', departure_date: '2000-01-01', adults: 1 })).toThrow('past');
    expect(svc.validateSearch({ origin: 'nbo', destination: 'mba', departure_date: '2099-01-01', adults: 2 }).origin).toBe('NBO');
  });

  it('books: verifies PIN, holds funds, confirms with provider', async () => {
    const pr = mkPrisma();
    const { svc, f, auth } = mk(pr, { createOrder: jest.fn().mockResolvedValue({ id: 'ord_1', booking_reference: 'ABC123', total_amount: 100, total_currency: 'USD', live_mode: false }) });
    const r = await svc.book(U, dto(), '1.1.1.1');
    expect(auth.verifyPin).toHaveBeenCalledWith(U, '1234');
    expect(pr.wallets.updateMany).toHaveBeenCalledWith({ where: { id: 'w1', balance: { gte: 13260 } }, data: { balance: { decrement: 13260 } } });
    expect(f.createOrder).toHaveBeenCalled();
    expect(r.status).toBe('confirmed');
    expect(r.booking_reference).toBe('ABC123');
  });

  it('is idempotent: same key returns the existing booking without charging', async () => {
    const pr = mkPrisma();
    pr.travel_bookings.findUnique.mockResolvedValue({ id: 'b0', status: 'confirmed', total_farm: 1, offer_amount: 1, service_fee_farm: 0 });
    const { svc, f, auth } = mk(pr);
    const r = await svc.book(U, dto(), '');
    expect(r.id).toBe('b0');
    expect(auth.verifyPin).not.toHaveBeenCalled();
    expect(f.createOrder).not.toHaveBeenCalled();
  });

  it('rejects when the price went up', async () => {
    const { svc } = mk(mkPrisma());
    await expect(svc.book(U, dto({ expected_total_farm: 13000 }), '')).rejects.toBeInstanceOf(ConflictException);
  });

  it('refunds in full when the provider rejects', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr, { createOrder: jest.fn().mockRejectedValue(new ProviderRejectedError('Offer no longer available')) });
    const r = await svc.book(U, dto(), '');
    expect(pr.wallets.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { balance: { increment: 13260 } } });
    expect(pr.transactions.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'reversed' }) }));
    expect(r.status).toBe('failed_refunded');
  });

  it('keeps funds held for review when the outcome is unknown', async () => {
    const pr = mkPrisma();
    const { svc } = mk(pr, { createOrder: jest.fn().mockRejectedValue(new ProviderUnknownError('timeout')) });
    const r = await svc.book(U, dto(), '');
    expect(r.status).toBe('needs_review');
    expect(pr.wallets.update).not.toHaveBeenCalled();
  });

  it('enforces Mkulima caps on AI-proposed bookings', async () => {
    const pr = mkPrisma();
    pr.ai_action_requests.findFirst.mockResolvedValue({ id: 'a1', action: 'book_flight', status: 'pending', expires_at: new Date(Date.now() + 1e5), payload: { offer_id: OFFER.id } });
    pr.ai_spend_permissions.findUnique.mockResolvedValue({ enabled: true, revoked_at: null, allowed_actions: ['book_flight'], per_tx_cap: 10000, daily_cap: 20000 });
    const { svc } = mk(pr);
    await expect(svc.book(U, dto({ ai_action_id: '00000000-0000-0000-0000-000000000001' }), '')).rejects.toThrow('per-payment cap');
  });
});
