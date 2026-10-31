import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CancelPolicy,
  HotelCancel,
  HotelGuest,
  HotelInfo,
  HotelOffer,
  HotelOrder,
  HotelPrebook,
  HotelProvider,
  HotelSearch,
  ProviderRejectedError,
  ProviderUnknownError,
} from './travel-provider';

type J = Record<string, any>;

/**
 * LiteAPI (Nuitee) hotels adapter. Docs: https://docs.liteapi.travel
 * Search: POST {api}/hotels/rates -> Prebook: POST {book}/rates/prebook -> Book: POST {book}/rates/book
 * -> Cancel: PUT {book}/bookings/{id}. Auth header X-API-Key.
 * Payment model: ACC_CREDIT_CARD ("account credit card"). The user pays FARM to the platform; LiteAPI
 * charges the card attached to the platform's LiteAPI account. Sandbox keys (sand_...) use a hidden test card.
 * Live keys are refused unless TRAVEL_ALLOW_LIVE=true.
 */
@Injectable()
export class LiteApiProvider implements HotelProvider {
  readonly name = 'liteapi';
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private get key() {
    return this.env.LITEAPI_API_KEY ?? '';
  }
  private get api() {
    return (
      this.env.LITEAPI_BASE_URL || 'https://api.liteapi.travel/v3.0'
    ).replace(/\/+$/, '');
  }
  private get bookApi() {
    return (
      this.env.LITEAPI_BOOK_BASE_URL || 'https://book.liteapi.travel/v3.0'
    ).replace(/\/+$/, '');
  }
  isSandbox() {
    return this.key.startsWith('sand_');
  }
  isConfigured() {
    return (
      !!this.key && (this.isSandbox() || this.env.TRAVEL_ALLOW_LIVE === 'true')
    );
  }

  private async call(
    method: string,
    url: string,
    body?: unknown,
    timeoutMs = 30000,
  ): Promise<J> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: {
          'X-API-Key': this.key,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ProviderUnknownError(
        `LiteAPI unreachable: ${(e as Error).name}`,
      );
    } finally {
      clearTimeout(t);
    }
    let json: J = {};
    try {
      json = (await res.json()) as J;
    } catch {
      /* empty */
    }
    if (res.ok && !json.error) return json;
    const msg = `LiteAPI ${res.status}: ${String(json.error?.message ?? json.error?.description ?? json.message ?? 'error').slice(0, 160)}`;
    if (res.status >= 500 || res.status === 429 || res.status === 408)
      throw new ProviderUnknownError(msg);
    if (res.status === 404) throw new NotFoundException('Not found or expired');
    throw new ProviderRejectedError(msg);
  }

  static policies(cp: J | undefined): {
    refundable: boolean | null;
    list: CancelPolicy[];
  } {
    const tag = cp?.refundableTag;
    return {
      refundable: tag === 'RFN' ? true : tag === 'NRFN' ? false : null,
      list: ((cp?.cancelPolicyInfos ?? []) as J[]).map((p) => ({
        cancel_time: `${p.cancelTime} ${p.timezone ?? 'GMT'}`,
        amount: Number(p.amount),
        currency: p.currency,
      })),
    };
  }

  static mapRates(data: J, live: boolean): HotelOffer[] {
    const hotels = new Map(((data.hotels ?? []) as J[]).map((h) => [h.id, h]));
    const out: HotelOffer[] = [];
    for (const h of (data.data ?? []) as J[]) {
      const info = hotels.get(h.hotelId) ?? {};
      for (const rt of (h.roomTypes ?? []) as J[]) {
        const rate = (rt.rates ?? [])[0] ?? {};
        const total =
          (rt.offerRetailRate ?? [])[0] ?? (rate.retailRate?.total ?? [])[0];
        if (!rt.offerId || !total || !(Number(total.amount) > 0)) continue;
        const pol = LiteApiProvider.policies(rate.cancellationPolicies);
        out.push({
          id: rt.offerId,
          provider: 'liteapi',
          hotel_id: h.hotelId,
          hotel_name: info.name ?? h.hotelId,
          address: info.address ?? null,
          photo: info.thumbnail ?? info.main_photo ?? null,
          stars: info.stars ?? null,
          room_name: rate.name ?? rt.name ?? 'Room',
          board: rate.boardName ?? null,
          refundable: pol.refundable,
          cancel_policies: pol.list,
          total_amount: Number(total.amount),
          total_currency: total.currency,
          live_mode: live,
        });
        break; // cheapest offer per hotel
      }
    }
    return out;
  }

  async searchHotels(q: HotelSearch): Promise<HotelOffer[]> {
    const body: J = {
      occupancies: [{ adults: q.adults }],
      currency: this.env.LITEAPI_CURRENCY || 'USD',
      guestNationality: this.env.LITEAPI_GUEST_NATIONALITY || 'KE',
      checkin: q.checkin,
      checkout: q.checkout,
      maxRatesPerHotel: 1,
      includeHotelData: true,
      limit: 30,
      timeout: 8,
    };
    if (q.iata_code) body.iataCode = q.iata_code;
    else {
      body.cityName = q.city_name;
      body.countryCode = q.country_code;
    }
    const data = await this.call(
      'POST',
      `${this.api}/hotels/rates`,
      body,
      40000,
    );
    return LiteApiProvider.mapRates(data, !this.isSandbox()).sort(
      (a, b) => a.total_amount - b.total_amount,
    );
  }

  static mapPrebook(d: J, live: boolean): HotelPrebook {
    const rate = (d.roomTypes?.[0]?.rates ?? [])[0] ?? {};
    const pol = LiteApiProvider.policies(rate.cancellationPolicies);
    return {
      prebook_id: d.prebookId,
      hotel_id: d.hotelId,
      checkin: d.checkin,
      checkout: d.checkout,
      total_amount: Number(d.price),
      total_currency: d.currency,
      refundable: pol.refundable,
      cancel_policies: pol.list,
      live_mode: live,
      room_name: rate.name ?? d.roomTypes?.[0]?.name ?? null,
      board: rate.boardName ?? null,
    };
  }

  async hotelInfo(hotelId: string): Promise<HotelInfo | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(hotelId)) return null;
    try {
      const r = await this.call(
        'GET',
        `${this.api}/data/hotel?hotelId=${encodeURIComponent(hotelId)}&timeout=4`,
        undefined,
        8000,
      );
      const d = r.data ?? {};
      if (typeof d.name !== 'string' || !d.name) return null;
      return {
        name: String(d.name).slice(0, 200),
        address: typeof d.address === 'string' ? d.address.slice(0, 300) : null,
        city: typeof d.city === 'string' ? d.city.slice(0, 100) : null,
        stars: Number.isFinite(Number(d.starRating))
          ? Number(d.starRating)
          : null,
      };
    } catch {
      return null;
    }
  }

  async prebook(offerId: string): Promise<HotelPrebook> {
    const r = await this.call(
      'POST',
      `${this.bookApi}/rates/prebook`,
      { offerId, usePaymentSdk: false },
      40000,
    );
    if (!r.data?.prebookId || !(Number(r.data.price) > 0))
      throw new ProviderRejectedError('LiteAPI prebook returned no price');
    return LiteApiProvider.mapPrebook(r.data, !this.isSandbox());
  }

  async getPrebook(prebookId: string): Promise<HotelPrebook> {
    const r = await this.call(
      'GET',
      `${this.bookApi}/prebooks/${encodeURIComponent(prebookId)}`,
    );
    if (!r.data?.prebookId)
      throw new NotFoundException('Prebook not found or expired');
    return LiteApiProvider.mapPrebook(r.data, !this.isSandbox());
  }

  async book(
    prebookId: string,
    g: HotelGuest,
    clientReference: string,
  ): Promise<HotelOrder> {
    const guest = {
      firstName: g.first_name,
      lastName: g.last_name,
      email: g.email,
      phone: g.phone,
    };
    const r = await this.call(
      'POST',
      `${this.bookApi}/rates/book`,
      {
        prebookId,
        clientReference,
        holder: guest,
        guests: [{ occupancyNumber: 1, ...guest }],
        payment: { method: 'ACC_CREDIT_CARD' },
      },
      90000,
    );
    const d = r.data ?? {};
    if (!d.bookingId)
      throw new ProviderUnknownError('LiteAPI book returned no bookingId');
    const status = String(d.status ?? '').toUpperCase();
    if (status && status !== 'CONFIRMED')
      throw new ProviderUnknownError(`LiteAPI booking status ${status}`);
    return {
      id: d.bookingId,
      confirmation_code: d.hotelConfirmationCode ?? null,
      status,
      total_amount: Number(d.price),
      total_currency: d.currency,
    };
  }

  async cancel(bookingId: string): Promise<HotelCancel> {
    const r = await this.call(
      'PUT',
      `${this.bookApi}/bookings/${encodeURIComponent(bookingId)}`,
      undefined,
      60000,
    );
    const d = r.data ?? {};
    return {
      status: String(d.status ?? ''),
      refund_amount: Number(d.refund_amount ?? 0),
      cancellation_fee: Number(d.cancellation_fee ?? 0),
      currency: d.currency,
    };
  }
}
