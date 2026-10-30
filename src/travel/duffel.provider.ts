import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FlightOffer,
  FlightOrder,
  FlightProvider,
  FlightSearch,
  Passenger,
  ProviderRejectedError,
  ProviderUnknownError,
} from './travel-provider';

type J = Record<string, any>;

/**
 * Duffel flights adapter (https://duffel.com/docs/api/v2). Uses Duffel Balance as payment
 * (the platform's prepaid Duffel balance); the user pays in FARM inside FARM.
 * Test tokens (duffel_test_...) hit Duffel's sandbox airline; live tokens are refused unless TRAVEL_ALLOW_LIVE=true.
 */
@Injectable()
export class DuffelProvider implements FlightProvider {
  readonly name = 'duffel';
  private readonly log = new Logger(DuffelProvider.name);
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private get token() {
    return this.env.DUFFEL_API_TOKEN ?? '';
  }
  isConfigured() {
    const t = this.token;
    if (!t) return false;
    if (t.startsWith('duffel_test_')) return true;
    return this.env.TRAVEL_ALLOW_LIVE === 'true';
  }

  private async call(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<J> {
    const base = (this.env.DUFFEL_BASE_URL ?? 'https://api.duffel.com').replace(/\/+$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'Duffel-Version': 'v2',
          authorization: `Bearer ${this.token}`,
        },
        body: body ? JSON.stringify({ data: body }) : undefined,
      });
    } catch (e) {
      throw new ProviderUnknownError(`Duffel unreachable: ${(e as Error).name}`);
    } finally {
      clearTimeout(t);
    }
    const json = (await res.json().catch(() => ({}))) as J;
    if (res.ok) return json.data as J;
    const msg = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (res.status === 404) throw new NotFoundException('Offer not found or expired');
    if (res.status >= 500 || res.status === 429) throw new ProviderUnknownError(`Duffel ${res.status}: ${msg}`);
    throw new ProviderRejectedError(msg);
  }

  static mapOffer(o: J): FlightOffer {
    return {
      id: o.id,
      provider: 'duffel',
      total_amount: Number(o.total_amount),
      total_currency: String(o.total_currency),
      expires_at: o.expires_at ?? null,
      owner: o.owner?.name ?? '',
      owner_logo: o.owner?.logo_symbol_url ?? null,
      slices: (o.slices ?? []).map((s: J) => ({
        origin: s.origin?.iata_code,
        destination: s.destination?.iata_code,
        duration: s.duration ?? null,
        segments: (s.segments ?? []).map((g: J) => ({
          origin: g.origin?.iata_code,
          destination: g.destination?.iata_code,
          departing_at: g.departing_at,
          arriving_at: g.arriving_at,
          carrier: g.marketing_carrier?.name ?? '',
          operating_carrier: g.operating_carrier?.name ?? g.marketing_carrier?.name ?? '',
          flight_number: `${g.marketing_carrier?.iata_code ?? ''}${g.marketing_carrier_flight_number ?? ''}`,
          duration: g.duration ?? null,
        })),
      })),
      passengers: (o.passengers ?? []).map((p: J) => ({ id: p.id, type: p.type ?? null })),
      refundable: o.conditions?.refund_before_departure?.allowed ?? null,
      changeable: o.conditions?.change_before_departure?.allowed ?? null,
      requires_instant_payment: o.payment_requirements?.requires_instant_payment ?? null,
      documents_required: o.passenger_identity_documents_required ?? null,
      live_mode: !!o.live_mode,
    };
  }

  async searchFlights(q: FlightSearch): Promise<FlightOffer[]> {
    const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.departure_date }];
    if (q.return_date) slices.push({ origin: q.destination, destination: q.origin, departure_date: q.return_date });
    const data = await this.call(
      'POST',
      '/air/offer_requests?return_offers=true&supplier_timeout=15000',
      { slices, passengers: Array.from({ length: q.adults }, () => ({ type: 'adult' })), cabin_class: q.cabin_class ?? 'economy' },
      40000,
    );
    return ((data.offers ?? []) as J[])
      .map((o) => DuffelProvider.mapOffer(o))
      .sort((a, b) => a.total_amount - b.total_amount)
      .slice(0, 30);
  }

  async getOffer(id: string) {
    return DuffelProvider.mapOffer(await this.call('GET', `/air/offers/${encodeURIComponent(id)}`));
  }

  async createOrder(offer: FlightOffer, passengers: Passenger[], idempotencyKey: string): Promise<FlightOrder> {
    const data = await this.call(
      'POST',
      '/air/orders',
      {
        type: 'instant',
        selected_offers: [offer.id],
        passengers,
        payments: [{ type: 'balance', currency: offer.total_currency, amount: offer.total_amount.toFixed(2) }],
        metadata: { farm_booking: idempotencyKey.slice(0, 50) },
      },
      60000,
    );
    return {
      id: data.id,
      booking_reference: data.booking_reference ?? null,
      total_amount: Number(data.total_amount),
      total_currency: data.total_currency,
      live_mode: !!data.live_mode,
    };
  }
}
