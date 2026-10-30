import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PkfareProvider } from './pkfare.provider';
import { LiteApiProvider } from './liteapi.provider';
import { selectFlightProvider } from './travel.module';
import { DuffelProvider } from './duffel.provider';
import { HotelsService } from './hotels.service';
import { TravelService } from './travel.service';
import { ProviderRejectedError, ProviderUnknownError } from './travel-provider';

const SHOP = {
  solutions: [
    {
      solutionId: 'S1',
      currency: 'USD',
      adtFare: 100,
      adtTax: 20,
      tktFee: 0,
      platingCarrier: 'KQ',
      journeys: { journey_0: ['F1'] },
      miniRuleMap: {
        ADT: [
          {
            miniRules: [
              { penaltyType: 0, isPermited: 0 },
              { penaltyType: 2, isPermited: 1 },
            ],
          },
        ],
      },
    },
  ],
  flights: [{ flightId: 'F1', journeyTime: 75, segmengtIds: ['G1'] }],
  segments: [
    {
      segmentId: 'G1',
      airline: 'KQ',
      flightNum: '602',
      bookingCode: 'Y',
      departure: 'NBO',
      arrival: 'MBA',
      strDepartureDate: '2099-01-01',
      strDepartureTime: '08:00',
      strArrivalDate: '2099-01-01',
      strArrivalTime: '09:15',
      flightTime: 75,
    },
  ],
};
const ENV = { PKFARE_PARTNER_ID: 'pid', PKFARE_PARTNER_KEY: 'pkey' };
function fetchSeq(...bodies: any[]) {
  const calls: string[] = [];
  const fn = jest.fn(async (url: string, init?: any) => {
    calls.push(url);
    const b = bodies.shift();
    if (b instanceof Error) throw b;
    const raw = Buffer.isBuffer(b)
      ? b
      : Buffer.from(JSON.stringify(b.body ?? b));
    return {
      status: b.status ?? 200,
      ok: (b.status ?? 200) < 400,
      arrayBuffer: async () => raw,
      json: async () => JSON.parse(raw.toString()),
      init,
    } as any;
  });
  (global as any).fetch = fn;
  return { fn, calls };
}
const decodeParam = (url: string) =>
  JSON.parse(
    Buffer.from(
      decodeURIComponent(url.split('param=')[1]),
      'base64',
    ).toString(),
  );

describe('provider selection', () => {
  it('defaults to duffel, pkfare when selected', () => {
    expect(selectFlightProvider({})).toBeInstanceOf(DuffelProvider);
    expect(
      selectFlightProvider({ TRAVEL_FLIGHT_PROVIDER: 'pkfare' }),
    ).toBeInstanceOf(PkfareProvider);
  });
});

describe('PkfareProvider', () => {
  it('config: needs id+key; non-sandbox host needs TRAVEL_ALLOW_LIVE', () => {
    expect(new PkfareProvider({}).isConfigured()).toBe(false);
    expect(new PkfareProvider(ENV).isConfigured()).toBe(true);
    expect(new PkfareProvider(ENV).isSandbox()).toBe(true);
    expect(
      new PkfareProvider({
        ...ENV,
        PKFARE_BASE_URL: 'https://prod.example',
      }).isConfigured(),
    ).toBe(false);
    expect(
      new PkfareProvider({
        ...ENV,
        PKFARE_BASE_URL: 'https://prod.example',
        TRAVEL_ALLOW_LIVE: 'true',
      }).isConfigured(),
    ).toBe(true);
  });
  it('signs with md5(partnerId+key), sends base64 param, gunzips, maps', async () => {
    const { calls } = fetchSeq(
      gzipSync(Buffer.from(JSON.stringify({ errorCode: '0', data: SHOP }))),
    );
    const offers = await new PkfareProvider(ENV).searchFlights({
      origin: 'NBO',
      destination: 'MBA',
      departure_date: '2099-01-01',
      adults: 2,
    });
    const req = decodeParam(calls[0]);
    expect(calls[0]).toContain('https://api.pkfare.com/shoppingV4?param=');
    expect(req.authentication.sign).toBe(
      createHash('md5').update('pidpkey').digest('hex'),
    );
    expect(req.search.searchAirLegs[0]).toMatchObject({
      origin: 'NBO',
      destination: 'MBA',
      cabinClass: 'Economy',
    });
    expect(offers[0].total_amount).toBe(240);
    expect(offers[0].slices[0].segments[0].flight_number).toBe('KQ602');
    expect(offers[0].refundable).toBe(false);
    expect(offers[0].changeable).toBe(true);
    const id = PkfareProvider.decodeId(offers[0].id);
    expect(id.n).toBe(2);
    expect(id.j[0][0]).toMatchObject({ a: 'KQ', f: '602', b: 'Y' });
  });
  it('getOffer re-prices; booking -> ticketing returns PNR', async () => {
    const id = PkfareProvider.encodeId(1, [
      [
        {
          a: 'KQ',
          f: '602',
          d: 'NBO',
          dd: '2099-01-01',
          dt: '08:00',
          r: 'MBA',
          ad: '2099-01-01',
          at: '09:15',
          b: 'Y',
        },
      ],
    ]);
    const { calls } = fetchSeq(
      {
        errorCode: '0',
        data: {
          solution: SHOP.solutions[0],
          flights: SHOP.flights,
          segments: SHOP.segments,
        },
      },
      { errorCode: '0', data: { orderNum: 'O1', pnr: 'ABC123' } },
      { errorCode: '0', data: { orderAmount: 120, payAmount: 120 } },
    );
    const p = new PkfareProvider(ENV);
    const o = await p.getOffer(id);
    expect(o.provider_data).toMatchObject({ solutionId: 'S1' });
    const pax = [
      {
        id: 'pax_1',
        title: 'mr',
        given_name: 'John',
        family_name: 'Kamau',
        gender: 'm',
        born_on: '1990-01-01',
        email: 'j@x.com',
        phone_number: '+254700000000',
      },
    ] as any;
    const order = await p.createOrder(o, pax, 'idem-1');
    expect(order).toMatchObject({ id: 'O1', booking_reference: 'ABC123' });
    const bk = decodeParam(calls[1]).booking;
    expect(bk.passengers[0]).toMatchObject({
      nationality: 'KE',
      psgType: 'ADT',
      sex: 'M',
    });
    expect(bk.solution.journeys.journey_0[0]).toMatchObject({
      airline: 'KQ',
      bookingCode: 'Y',
    });
    expect(decodeParam(calls[2]).ticketing).toMatchObject({
      orderNum: 'O1',
      pnr: 'ABC123',
    });
  });
  it('error mapping: B022 rejected (refund), S001/network unknown (review)', async () => {
    const id = PkfareProvider.encodeId(1, [
      [
        {
          a: 'KQ',
          f: '1',
          d: 'A',
          dd: 'x',
          dt: 'y',
          r: 'B',
          ad: 'x',
          at: 'y',
          b: 'Y',
        },
      ],
    ]);
    const p = new PkfareProvider(ENV);
    const off = {
      provider_data: {
        solutionId: 'S',
        journeys: PkfareProvider.decodeId(id).j,
      },
    } as any;
    const pax = [
      { given_name: 'A', family_name: 'B', email: 'e', phone_number: 'p' },
    ] as any;
    fetchSeq(
      { errorCode: '0', data: { orderNum: 'O', pnr: 'P' } },
      { errorCode: 'B022', errorMsg: 'Insufficient balance' },
    );
    await expect(p.createOrder(off, pax, 'k')).rejects.toBeInstanceOf(
      ProviderRejectedError,
    );
    fetchSeq({ errorCode: 'S001', errorMsg: 'system' });
    await expect(p.createOrder(off, pax, 'k')).rejects.toBeInstanceOf(
      ProviderUnknownError,
    );
    fetchSeq(new Error('timeout'));
    await expect(p.createOrder(off, pax, 'k')).rejects.toBeInstanceOf(
      ProviderUnknownError,
    );
  });
  it('rejects tampered offer ids', () => {
    expect(() => PkfareProvider.decodeId('off_123')).toThrow();
    expect(() => PkfareProvider.decodeId('pk_!!!')).toThrow();
  });
});

const RATES = {
  data: [
    {
      hotelId: 'lp1',
      roomTypes: [
        {
          offerId: 'OFF-LONG-1',
          offerRetailRate: [{ amount: 150, currency: 'USD' }],
          rates: [
            {
              name: 'Double',
              boardName: 'Breakfast',
              cancellationPolicies: {
                refundableTag: 'RFN',
                cancelPolicyInfos: [
                  {
                    cancelTime: '2099-01-01 08:00:00',
                    amount: 150,
                    currency: 'USD',
                    timezone: 'GMT',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
  hotels: [
    { id: 'lp1', name: 'Test Hotel', address: 'x', stars: 4, thumbnail: 't' },
  ],
};
const PREBOOK = {
  data: {
    prebookId: 'PB1',
    hotelId: 'lp1',
    checkin: '2099-01-01',
    checkout: '2099-01-03',
    currency: 'USD',
    price: 100,
    roomTypes: [
      {
        rates: [
          {
            cancellationPolicies: {
              refundableTag: 'RFN',
              cancelPolicyInfos: [],
            },
          },
        ],
      },
    ],
  },
};

describe('LiteApiProvider', () => {
  it('config: sandbox key ok, live key needs TRAVEL_ALLOW_LIVE', () => {
    expect(new LiteApiProvider({}).isConfigured()).toBe(false);
    expect(
      new LiteApiProvider({ LITEAPI_API_KEY: 'sand_x' }).isConfigured(),
    ).toBe(true);
    expect(
      new LiteApiProvider({ LITEAPI_API_KEY: 'prod_x' }).isConfigured(),
    ).toBe(false);
    expect(
      new LiteApiProvider({
        LITEAPI_API_KEY: 'prod_x',
        TRAVEL_ALLOW_LIVE: 'true',
      }).isConfigured(),
    ).toBe(true);
  });
  it('search/prebook/book/cancel hit documented endpoints; book uses ACC_CREDIT_CARD', async () => {
    const { fn, calls } = fetchSeq(
      RATES,
      PREBOOK,
      {
        data: {
          bookingId: 'BK1',
          status: 'CONFIRMED',
          hotelConfirmationCode: 'HC1',
          price: 100,
          currency: 'USD',
        },
      },
      {
        data: {
          bookingId: 'BK1',
          status: 'CANCELLED',
          refund_amount: 100,
          cancellation_fee: 0,
          currency: 'USD',
        },
      },
    );
    const p = new LiteApiProvider({ LITEAPI_API_KEY: 'sand_x' });
    const offers = await p.searchHotels({
      city_name: 'Nairobi',
      country_code: 'KE',
      checkin: '2099-01-01',
      checkout: '2099-01-03',
      adults: 2,
    });
    expect(offers[0]).toMatchObject({
      id: 'OFF-LONG-1',
      hotel_name: 'Test Hotel',
      total_amount: 150,
      refundable: true,
      live_mode: false,
    });
    expect(calls[0]).toBe('https://api.liteapi.travel/v3.0/hotels/rates');
    expect(fn.mock.calls[0][1].headers['X-API-Key']).toBe('sand_x');
    const pb = await p.prebook('OFF-LONG-1');
    expect(calls[1]).toBe('https://book.liteapi.travel/v3.0/rates/prebook');
    expect(pb).toMatchObject({ prebook_id: 'PB1', total_amount: 100 });
    const o = await p.book(
      'PB1',
      {
        first_name: 'A',
        last_name: 'B',
        email: 'a@b.co',
        phone: '+254700000000',
      },
      'ref1',
    );
    expect(JSON.parse(fn.mock.calls[2][1].body)).toMatchObject({
      prebookId: 'PB1',
      clientReference: 'ref1',
      payment: { method: 'ACC_CREDIT_CARD' },
    });
    expect(o).toMatchObject({ id: 'BK1', confirmation_code: 'HC1' });
    const c = await p.cancel('BK1');
    expect(fn.mock.calls[3][1].method).toBe('PUT');
    expect(c.refund_amount).toBe(100);
  });
  it('5xx is unknown, 4xx rejected', async () => {
    const p = new LiteApiProvider({ LITEAPI_API_KEY: 'sand_x' });
    fetchSeq({ status: 503, body: {} });
    await expect(p.prebook('x')).rejects.toBeInstanceOf(ProviderUnknownError);
    fetchSeq({ status: 400, body: { error: { message: 'bad' } } });
    await expect(p.prebook('x')).rejects.toBeInstanceOf(ProviderRejectedError);
  });
});

function mkPrisma() {
  const p: any = {
    wallet: { id: 'w1', balance: 50000, locked_balance: 0, is_frozen: false },
    row: null as any,
    travel_bookings: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) => (where.id ? p.row : null)),
      findFirst: jest.fn().mockImplementation(() => p.row),
      create: jest
        .fn()
        .mockImplementation(({ data }) => (p.row = { id: 'b1', ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => (p.row = { ...p.row, ...data })),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        const ok =
          p.row &&
          (typeof where.status === 'string'
            ? p.row.status === where.status
            : where.status.in.includes(p.row.status));
        if (ok) p.row = { ...p.row, ...data };
        return { count: ok ? 1 : 0 };
      }),
    },
    wallets: {
      findFirst: jest.fn(() => p.wallet),
      findUnique: jest.fn(() => p.wallet),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    transactions: {
      create: jest.fn(({ data }) => ({
        id: data.transaction_type === 'escrow_lock' ? 't1' : 'tR',
        ...data,
      })),
      update: jest.fn(),
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 't1', sender_wallet_id: 'w1' }),
    },
    ledger_entries: { create: jest.fn() },
  };
  p.$transaction = jest.fn((fn: any) => fn(p));
  return p;
}
function mkHotels(prisma: any, h: any = {}) {
  const prov = {
    name: 'liteapi',
    isConfigured: () => true,
    isSandbox: () => true,
    searchHotels: jest.fn(),
    prebook: jest.fn(),
    getPrebook: jest.fn().mockResolvedValue({
      prebook_id: 'PB1',
      hotel_id: 'lp1',
      checkin: '2099-01-01',
      checkout: '2099-01-03',
      total_amount: 100,
      total_currency: 'USD',
      refundable: true,
      cancel_policies: [],
      live_mode: false,
    }),
    book: jest.fn().mockResolvedValue({
      id: 'BK1',
      confirmation_code: 'HC1',
      status: 'CONFIRMED',
      total_amount: 100,
      total_currency: 'USD',
    }),
    cancel: jest.fn(),
    ...h,
  };
  const rates = {
    usdcKes: jest.fn().mockResolvedValue({ rate: 128, mid: 130 }),
  };
  const auth = { verifyPin: jest.fn() };
  const travel = new TravelService(
    prisma,
    auth as any,
    rates as any,
    { name: 'duffel', isConfigured: () => false, isSandbox: () => true } as any,
  );
  return {
    svc: new HotelsService(prisma, auth as any, travel, prov),
    prov,
    auth,
    travel,
  };
}
const guest = {
  first_name: 'Jane',
  last_name: 'Wanjiku',
  email: 'j@example.com',
  phone: '+254700000000',
};
const bdto = (o: any = {}) => ({
  prebook_id: 'PB1',
  expected_total_farm: 13260,
  idempotency_key: 'idem-hotel-1',
  pin: '1234',
  guest,
  ...o,
});

describe('HotelsService', () => {
  beforeEach(() => {
    process.env.HOTELS_ENABLED = 'true';
    process.env.TRAVEL_FX_MARKUP_BPS = '200';
    delete process.env.TRAVEL_SERVICE_FEE_FARM;
  });
  afterAll(() => delete process.env.HOTELS_ENABLED);

  it('off unless HOTELS_ENABLED', async () => {
    process.env.HOTELS_ENABLED = 'false';
    const { svc } = mkHotels(mkPrisma());
    expect(svc.status().enabled).toBe(false);
    await expect(
      svc.search({
        city_name: 'Nairobi',
        country_code: 'KE',
        checkin: '2099-01-01',
        checkout: '2099-01-02',
        adults: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('validates search input', () => {
    const { svc } = mkHotels(mkPrisma());
    expect(() =>
      svc.normalize({
        city_name: 'Nairobi',
        country_code: 'KE',
        checkin: '2099-01-03',
        checkout: '2099-01-01',
        adults: 1,
      }),
    ).toThrow(BadRequestException);
    expect(
      svc.normalize({
        iata_code: 'nbo',
        checkin: '2099-01-01',
        checkout: '2099-01-02',
        adults: 1,
      }).iata_code,
    ).toBe('NBO');
  });
  it('books: PIN, hold, provider book, confirmed', async () => {
    const prisma = mkPrisma();
    const { svc, prov, auth } = mkHotels(prisma);
    const r = await svc.book('u1', bdto(), '1.1.1.1');
    expect(auth.verifyPin).toHaveBeenCalled();
    expect(r.status).toBe('confirmed');
    expect(r.kind).toBe('hotel');
    expect(r.total_farm).toBe(13260); // 100 USD * 130 * 1.02
    expect(prov.book).toHaveBeenCalledWith(
      'PB1',
      expect.objectContaining({ first_name: 'Jane' }),
      'b1',
    );
  });
  it('stores hotel name in the booking summary (best-effort)', async () => {
    const prisma = mkPrisma();
    const { svc, travel } = mkHotels(prisma, {
      hotelInfo: jest.fn().mockResolvedValue({
        name: 'Best Western Plus Meridian Hotel',
        address: '6 Muranga Road',
        city: 'Nairobi',
        stars: 4,
      }),
    });
    const spy = jest.spyOn(travel, 'holdAndCreate');
    await svc.book('u1', bdto(), '');
    const summary = JSON.stringify(spy.mock.calls[0]);
    expect(summary).toContain(
      '"hotel_name":"Best Western Plus Meridian Hotel"',
    );
    expect(summary).toContain('"hotel_city":"Nairobi"');
  });
  it('hotel info lookup failure does not block booking', async () => {
    const prisma = mkPrisma();
    const { svc } = mkHotels(prisma, {
      hotelInfo: jest.fn().mockRejectedValue(new Error('down')),
    });
    const r = await svc.book('u1', bdto(), '');
    expect(r.status).toBe('confirmed');
  });
  it('provider rejection on prebook -> 409, outage -> 503', async () => {
    const { svc } = mkHotels(mkPrisma(), {
      prebook: jest
        .fn()
        .mockRejectedValueOnce(
          new ProviderRejectedError('LiteAPI 409: no availability found'),
        )
        .mockRejectedValueOnce(new Error('socket hang up')),
    });
    await expect(svc.prebook('offer-abc')).rejects.toThrow(
      'This room is no longer available. Please choose another.',
    );
    await expect(svc.prebook('offer-abc')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('price increase -> conflict, no hold', async () => {
    const prisma = mkPrisma();
    const { svc } = mkHotels(prisma);
    await expect(
      svc.book('u1', bdto({ expected_total_farm: 13000 }), ''),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.transactions.create).not.toHaveBeenCalled();
  });
  it('rejected booking refunds; unknown holds for review', async () => {
    let prisma = mkPrisma();
    let h = mkHotels(prisma, {
      book: jest.fn().mockRejectedValue(new ProviderRejectedError('sold out')),
    });
    expect((await h.svc.book('u1', bdto(), '')).status).toBe('failed_refunded');
    prisma = mkPrisma();
    h = mkHotels(prisma, {
      book: jest.fn().mockRejectedValue(new ProviderUnknownError('timeout')),
    });
    expect((await h.svc.book('u1', bdto(), '')).status).toBe('needs_review');
  });
  it('cancel refunds FARM pro-rata to the provider-confirmed refund', async () => {
    const prisma = mkPrisma();
    prisma.row = {
      id: 'b1',
      user_id: 'u1',
      kind: 'hotel',
      status: 'confirmed',
      provider_order_id: 'BK1',
      offer_amount: 100,
      total_farm: 13260,
      transaction_id: 't1',
    };
    const { svc } = mkHotels(prisma, {
      cancel: jest.fn().mockResolvedValue({
        status: 'CANCELLED',
        refund_amount: 50,
        cancellation_fee: 50,
        currency: 'USD',
      }),
    });
    const r = await svc.cancel('u1', 'b1');
    expect(r.status).toBe('cancelled');
    const credit = prisma.ledger_entries.create.mock.calls.find(
      (c: any) => c[0].data.entry_type === 'credit',
    );
    expect(credit[0].data.amount).toBe(6630);
  });
  it('non-refundable cancel returns nothing; provider refusal keeps it confirmed', async () => {
    const prisma = mkPrisma();
    prisma.row = {
      id: 'b1',
      user_id: 'u1',
      kind: 'hotel',
      status: 'confirmed',
      provider_order_id: 'BK1',
      offer_amount: 100,
      total_farm: 13260,
      transaction_id: 't1',
    };
    const { svc } = mkHotels(prisma, {
      cancel: jest.fn().mockResolvedValue({
        status: 'CANCELLED',
        refund_amount: 0,
        cancellation_fee: 100,
        currency: 'USD',
      }),
    });
    expect((await svc.cancel('u1', 'b1')).status).toBe('cancelled');
    expect(prisma.ledger_entries.create).not.toHaveBeenCalled();
    prisma.row.status = 'confirmed';
    const h2 = mkHotels(prisma, {
      cancel: jest.fn().mockRejectedValue(new ProviderRejectedError('no')),
    });
    await expect(h2.svc.cancel('u1', 'b1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.row.status).toBe('confirmed');
  });
});
