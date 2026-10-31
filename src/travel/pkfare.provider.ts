import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import {
  FlightOffer,
  FlightOrder,
  FlightProvider,
  FlightSearch,
  FlightSlice,
  Passenger,
  ProviderRejectedError,
  ProviderUnknownError,
} from './travel-provider';

type J = Record<string, any>;
export const PKFARE_SANDBOX_URL = 'https://api.pkfare.com';
/** Codes where PKFARE may still have acted (timeouts / system errors): never refund blindly. */
const UNKNOWN_CODES = new Set(['S001', 'B012', 'B024', 'B025', 'B028', 'B035']);
/** Offer ids are `pk_` + base64url(compact itinerary); offers are re-priced by PrecisePricing before booking. */
const PREFIX = 'pk_';

interface Seg {
  a: string;
  f: string;
  d: string;
  dd: string;
  dt: string;
  r: string;
  ad: string;
  at: string;
  b: string;
}

/**
 * PKFARE flights adapter (public docs: https://apifox.pkfare.com/apidoc/docs-site/345083).
 * Flow: Shopping_V4 -> PrecisePricing (on offer view/book) -> PreciseBooking_V5 -> Ticketing.
 * Payment model: PRE-FUNDED DEPOSIT. Ticketing deducts the platform's prepaid PKFARE balance
 * (no card, no merchant fee on "Prepaid"). Users pay FARM to the platform; ops tops up the deposit.
 * If the deposit is short, ticketing fails with B022 and the user's FARM hold is refunded.
 * Requests: JSON -> base64 -> `?param=` (as documented); responses may be gzip.
 * Sandbox host is api.pkfare.com; PKFARE issues a separate production host after certification,
 * which is refused unless TRAVEL_ALLOW_LIVE=true.
 */
@Injectable()
export class PkfareProvider implements FlightProvider {
  readonly name = 'pkfare';
  private readonly log = new Logger(PkfareProvider.name);
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private get base() {
    return (this.env.PKFARE_BASE_URL || PKFARE_SANDBOX_URL).replace(/\/+$/, '');
  }
  isSandbox() {
    return this.base === PKFARE_SANDBOX_URL;
  }
  isConfigured() {
    if (!this.env.PKFARE_PARTNER_ID || !this.env.PKFARE_PARTNER_KEY)
      return false;
    return this.isSandbox() || this.env.TRAVEL_ALLOW_LIVE === 'true';
  }
  private auth() {
    const id = this.env.PKFARE_PARTNER_ID ?? '';
    return {
      partnerId: id,
      sign: createHash('md5')
        .update(id + (this.env.PKFARE_PARTNER_KEY ?? ''))
        .digest('hex'),
    };
  }

  static encode(obj: unknown) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }

  private async call(path: string, payload: J, timeoutMs = 30000): Promise<J> {
    const param = PkfareProvider.encode({
      authentication: this.auth(),
      ...payload,
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let raw: Buffer;
    let status: number;
    try {
      const res = await fetch(
        `${this.base}/${path}?param=${encodeURIComponent(param)}`,
        {
          method: 'GET',
          signal: ctrl.signal,
          headers: { accept: 'application/json', 'accept-encoding': 'gzip' },
        },
      );
      status = res.status;
      raw = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      throw new ProviderUnknownError(
        `PKFARE unreachable: ${(e as Error).name}`,
      );
    } finally {
      clearTimeout(t);
    }
    if (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b)
      raw = gunzipSync(raw);
    let json: J;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      if (status >= 500 || status === 429 || status === 0)
        throw new ProviderUnknownError(`PKFARE ${status}`);
      throw new ProviderRejectedError(`PKFARE ${status}`);
    }
    const code = String(json.errorCode ?? '');
    if (code === '0') return (json.data ?? {}) as J;
    const msg = `${code}: ${String(json.errorMsg ?? 'error').slice(0, 160)}`;
    if (UNKNOWN_CODES.has(code) || status >= 500)
      throw new ProviderUnknownError(`PKFARE ${msg}`);
    throw new ProviderRejectedError(`PKFARE ${msg}`);
  }

  static encodeId(adults: number, journeys: Seg[][]) {
    return (
      PREFIX +
      Buffer.from(JSON.stringify({ n: adults, j: journeys })).toString(
        'base64url',
      )
    );
  }
  static decodeId(id: string): { n: number; j: Seg[][] } {
    if (!id.startsWith(PREFIX))
      throw new NotFoundException('Offer not found or expired');
    try {
      const o = JSON.parse(
        Buffer.from(id.slice(PREFIX.length), 'base64url').toString('utf8'),
      );
      if (
        !(o.n >= 1 && o.n <= 9) ||
        !Array.isArray(o.j) ||
        !o.j.length ||
        o.j.length > 2
      )
        throw new Error('shape');
      return o;
    } catch {
      throw new NotFoundException('Offer not found or expired');
    }
  }

  /** Maps one PKFARE solution (+ flights/segments lookup) to a FlightOffer. */
  static mapSolution(
    sol: J,
    flights: J[],
    segments: J[],
    adults: number,
    live: boolean,
  ): FlightOffer | null {
    const fById = new Map(flights.map((f) => [f.flightId, f]));
    const sById = new Map(segments.map((g) => [g.segmentId, g]));
    const keys = Object.keys(sol.journeys ?? {}).sort();
    const journeys: Seg[][] = [];
    const slices: FlightSlice[] = [];
    for (const k of keys) {
      const ids: string[] = sol.journeys[k] ?? [];
      const segs: J[] = [];
      for (const fid of ids) {
        const f = fById.get(fid);
        for (const sid of f?.segmengtIds ?? f?.segmentIds ?? []) {
          const g = sById.get(sid);
          if (g) segs.push(g);
        }
      }
      if (!segs.length) return null;
      journeys.push(
        segs.map((g) => ({
          a: g.airline,
          f: String(g.flightNum),
          d: g.departure,
          dd: g.strDepartureDate,
          dt: g.strDepartureTime,
          r: g.arrival,
          ad: g.strArrivalDate,
          at: g.strArrivalTime,
          b: g.bookingCode,
        })),
      );
      const ft = fById.get(ids[0]);
      slices.push({
        origin: segs[0].departure,
        destination: segs[segs.length - 1].arrival,
        duration:
          ft?.journeyTime != null
            ? `PT${Math.floor(ft.journeyTime / 60)}H${ft.journeyTime % 60}M`
            : null,
        segments: segs.map((g) => ({
          origin: g.departure,
          destination: g.arrival,
          departing_at: `${g.strDepartureDate}T${g.strDepartureTime}:00`,
          arriving_at: `${g.strArrivalDate}T${g.strArrivalTime}:00`,
          carrier: g.airline,
          operating_carrier: g.opFltAirline || g.airline,
          flight_number: `${g.airline}${g.flightNum}`,
          duration:
            g.flightTime != null
              ? `PT${Math.floor(g.flightTime / 60)}H${g.flightTime % 60}M`
              : null,
        })),
      });
    }
    const per =
      Number(sol.adtFare ?? 0) +
      Number(sol.adtTax ?? 0) +
      Number(sol.tktFee ?? 0);
    const total =
      Math.round(
        (per * adults +
          Number(sol.platformServiceFee ?? 0) +
          Number(sol.merchantFee ?? 0)) *
          100,
      ) / 100;
    if (!(total > 0)) return null;
    const refundRule = (sol.miniRuleMap?.ADT?.[0]?.miniRules ?? []).find(
      (r: J) => r.penaltyType === 0,
    );
    const changeRule = (sol.miniRuleMap?.ADT?.[0]?.miniRules ?? []).find(
      (r: J) => r.penaltyType === 2,
    );
    return {
      id: PkfareProvider.encodeId(adults, journeys),
      provider: 'pkfare',
      total_amount: total,
      total_currency: String(sol.currency),
      expires_at: null,
      owner: sol.platingCarrier ?? journeys[0][0].a,
      owner_logo: null,
      slices,
      passengers: Array.from({ length: adults }, (_, i) => ({
        id: `pax_${i + 1}`,
        type: 'adult',
      })),
      refundable: refundRule ? refundRule.isPermited === 1 : null,
      changeable: changeRule ? changeRule.isPermited === 1 : null,
      requires_instant_payment: true,
      documents_required: null,
      live_mode: live,
      provider_data: {
        solutionId: sol.solutionId,
        adtFare: sol.adtFare,
        adtTax: sol.adtTax,
        journeys,
      },
    };
  }

  private static wireJourneys(j: Seg[][], withCode = true) {
    const out: J = {};
    j.forEach((segs, i) => {
      out[`journey_${i}`] = segs.map((s) => ({
        airline: s.a,
        flightNum: s.f,
        departure: s.d,
        departureDate: s.dd,
        departureTime: s.dt,
        arrival: s.r,
        arrivalDate: s.ad,
        arrivalTime: s.at,
        ...(withCode && s.b ? { bookingCode: s.b } : {}),
      }));
    });
    return out;
  }

  async searchFlights(q: FlightSearch): Promise<FlightOffer[]> {
    const cabin = {
      economy: 'Economy',
      premium_economy: 'PremiumEconomy',
      business: 'Business',
      first: 'First',
    }[q.cabin_class ?? 'economy'];
    const legs = [
      {
        origin: q.origin,
        destination: q.destination,
        departureDate: q.departure_date,
        cabinClass: cabin,
      },
    ];
    if (q.return_date)
      legs.push({
        origin: q.destination,
        destination: q.origin,
        departureDate: q.return_date,
        cabinClass: cabin,
      });
    const data = await this.call(
      'shoppingV4',
      {
        search: {
          adults: q.adults,
          children: 0,
          infants: 0,
          nonstop: 0,
          solutions: 30,
          searchAirLegs: legs,
        },
      },
      45000,
    );
    return ((data.solutions ?? []) as J[])
      .map((s) =>
        PkfareProvider.mapSolution(
          s,
          data.flights ?? [],
          data.segments ?? [],
          q.adults,
          !this.isSandbox(),
        ),
      )
      .filter((o): o is FlightOffer => !!o)
      .sort((a, b) => a.total_amount - b.total_amount)
      .slice(0, 30);
  }

  /** Re-prices the itinerary with PrecisePricing (retries once without booking codes on B020/B021, per docs). */
  async getOffer(id: string): Promise<FlightOffer> {
    const { n, j } = PkfareProvider.decodeId(id);
    const price = (withCode: boolean) =>
      this.call(
        'precisePricing',
        {
          pricing: {
            adults: n,
            children: 0,
            journeys: PkfareProvider.wireJourneys(j, withCode),
          },
        },
        40000,
      );
    let data: J;
    try {
      data = await price(true);
    } catch (e) {
      if (e instanceof ProviderRejectedError && /B02[01]/.test(e.message))
        data = await price(false);
      else throw e;
    }
    const o = PkfareProvider.mapSolution(
      data.solution ?? {},
      data.flights ?? [],
      data.segments ?? [],
      n,
      !this.isSandbox(),
    );
    if (!o) throw new NotFoundException('Offer not found or expired');
    return o;
  }

  async createOrder(
    offer: FlightOffer,
    passengers: Passenger[],
    idempotencyKey: string,
  ): Promise<FlightOrder> {
    const pd = (offer.provider_data ?? {}) as J;
    if (!pd.solutionId || !Array.isArray(pd.journeys))
      throw new ProviderRejectedError('Offer must be re-priced before booking');
    const defNat = (this.env.PKFARE_DEFAULT_NATIONALITY || 'KE').toUpperCase();
    const booking = await this.call(
      'preciseBooking_V5',
      {
        booking: {
          buyerOrder: idempotencyKey.slice(0, 50),
          passengers: passengers.map((p) => ({
            birthday: p.born_on,
            firstName: p.given_name,
            lastName: p.family_name,
            nationality: (p.nationality || defNat).toUpperCase(),
            psgType: 'ADT',
            sex: p.gender === 'f' ? 'F' : 'M',
          })),
          solution: {
            solutionId: pd.solutionId,
            adtFare: pd.adtFare,
            adtTax: pd.adtTax,
            journeys: PkfareProvider.wireJourneys(pd.journeys),
          },
        },
      },
      60000,
    );
    const orderNum = String(booking.orderNum ?? '');
    const pnr = String(booking.pnr ?? '');
    if (!orderNum || !pnr)
      throw new ProviderUnknownError(
        'PKFARE booking returned no order number/PNR',
      );
    const lead = passengers[0];
    try {
      // Deducts the prepaid deposit. Tickets numbers arrive later (TicketingNumPush / OrderDetail).
      await this.call(
        'ticketing',
        {
          ticketing: {
            orderNum,
            pnr,
            PNR: pnr,
            name: `${lead.family_name}/${lead.given_name}`,
            email: lead.email,
            telNum: lead.phone_number,
          },
        },
        60000,
      );
    } catch (e) {
      if (e instanceof ProviderRejectedError) {
        // Booked but not ticketed (e.g. B022 deposit too low). The unpaid PNR lapses; the user is refunded.
        this.log.warn(`PKFARE order ${orderNum} not ticketed: ${e.message}`);
      }
      throw e;
    }
    return {
      id: orderNum,
      booking_reference: pnr,
      total_amount: offer.total_amount,
      total_currency: offer.total_currency,
      live_mode: !this.isSandbox(),
    };
  }
}
