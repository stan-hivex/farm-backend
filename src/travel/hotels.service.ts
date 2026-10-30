import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { HotelProvider } from './travel-provider';
import {
  HOTEL_PROVIDER,
  HotelSearch,
  ProviderRejectedError,
  ProviderUnknownError,
} from './travel-provider';

/** Provider rejections (e.g. "no availability") are client-facing 409s, not 500s. */
function mapProviderError(what: string) {
  return (e: unknown): never => {
    if (e instanceof ProviderRejectedError)
      throw new ConflictException(
        /availability/i.test(e.message)
          ? 'This room is no longer available. Please choose another.'
          : e.message,
      );
    if (e instanceof Error && 'getStatus' in e) throw e;
    throw new ServiceUnavailableException(
      `Hotel ${what} is unavailable right now`,
    );
  };
}
import { TravelService } from './travel.service';

export interface HotelBookDto {
  prebook_id: string;
  expected_total_farm: number;
  idempotency_key: string;
  pin: string;
  guest: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
}

/**
 * Hotels (LiteAPI). Off unless HOTELS_ENABLED=true and the provider is configured.
 * Money: FARM is held from the user's wallet before booking (same escrow path as flights);
 * the provider charges the platform's account card (ACC_CREDIT_CARD).
 * Cancel: FARM is returned only for the amount the provider confirms as refunded.
 */
@Injectable()
export class HotelsService {
  private readonly log = new Logger(HotelsService.name);
  private readonly env = process.env;
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly travel: TravelService,
    @Inject(HOTEL_PROVIDER) private readonly hotels: HotelProvider,
  ) {}

  enabled() {
    return this.env.HOTELS_ENABLED === 'true' && this.hotels.isConfigured();
  }
  status() {
    return {
      enabled: this.enabled(),
      provider: this.enabled() ? this.hotels.name : null,
      sandbox: this.enabled() ? this.hotels.isSandbox() : null,
    };
  }
  private ensure() {
    if (!this.enabled())
      throw new ServiceUnavailableException('Hotels are not available yet');
  }

  private async withPrice<
    T extends { total_amount: number; total_currency: string },
  >(o: T) {
    const p = await this.travel.priceFarm(o.total_amount, o.total_currency);
    return {
      ...o,
      price_farm: p?.total ?? null,
      fx_rate: p?.fx_rate ?? null,
      service_fee_farm: p?.fee ?? null,
      bookable: !!p,
    };
  }

  normalize(q: Partial<HotelSearch>): HotelSearch {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(String(q.checkin)) || !iso.test(String(q.checkout)))
      throw new BadRequestException('Dates must be YYYY-MM-DD');
    const today = new Date().toISOString().slice(0, 10);
    if (q.checkin! < today)
      throw new BadRequestException('Check-in must be today or later');
    if (q.checkout! <= q.checkin!)
      throw new BadRequestException('Check-out must be after check-in');
    const nights =
      (Date.parse(q.checkout!) - Date.parse(q.checkin!)) / 86400000;
    if (nights > 30) throw new BadRequestException('Maximum 30 nights');
    const adults = Number(q.adults ?? 1);
    if (!Number.isInteger(adults) || adults < 1 || adults > 6)
      throw new BadRequestException('Adults must be 1-6');
    const iata = String(q.iata_code ?? '')
      .toUpperCase()
      .trim();
    const city = String(q.city_name ?? '').trim();
    const cc = String(q.country_code ?? '')
      .toUpperCase()
      .trim();
    if (iata) {
      if (!/^[A-Z]{3}$/.test(iata))
        throw new BadRequestException('Invalid airport/city code');
      return {
        iata_code: iata,
        checkin: q.checkin!,
        checkout: q.checkout!,
        adults,
      };
    }
    if (!city || city.length > 60 || !/^[A-Z]{2}$/.test(cc))
      throw new BadRequestException(
        'City and 2-letter country code are required',
      );
    return {
      city_name: city,
      country_code: cc,
      checkin: q.checkin!,
      checkout: q.checkout!,
      adults,
    };
  }

  async search(q: Partial<HotelSearch>) {
    this.ensure();
    const offers = await this.hotels
      .searchHotels(this.normalize(q))
      .catch(mapProviderError('search'));
    return Promise.all(offers.map((o) => this.withPrice(o)));
  }

  async prebook(offerId: string) {
    this.ensure();
    if (!/^[A-Za-z0-9_\-+/=.:]{5,4000}$/.test(String(offerId ?? '')))
      throw new BadRequestException('Invalid offer id');
    return this.withPrice(
      await this.hotels.prebook(offerId).catch(mapProviderError('prebook')),
    );
  }

  async book(userId: string, dto: HotelBookDto, ip: string) {
    this.ensure();
    const key = String(dto.idempotency_key ?? '').trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key))
      throw new BadRequestException('idempotency_key is required');
    const existing = await this.prisma.travel_bookings.findUnique({
      where: {
        user_id_idempotency_key: { user_id: userId, idempotency_key: key },
      },
    });
    if (existing) return this.travel.view(existing);
    if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
    await this.auth.verifyPin(userId, dto.pin);
    const g = dto.guest ?? ({} as HotelBookDto['guest']);
    const nm = (s: string) => String(s ?? '').trim();
    if (
      !/^[A-Za-z' -]{1,40}$/.test(nm(g.first_name)) ||
      !/^[A-Za-z' -]{1,40}$/.test(nm(g.last_name))
    )
      throw new BadRequestException('Guest name is invalid');
    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nm(g.email)) ||
      !/^\+\d{7,15}$/.test(nm(g.phone))
    )
      throw new BadRequestException('Guest email/phone is invalid');
    if (!/^[A-Za-z0-9_-]{3,200}$/.test(String(dto.prebook_id ?? '')))
      throw new BadRequestException('Invalid prebook id');

    const pb = await this.withPrice(
      await this.hotels
        .getPrebook(dto.prebook_id)
        .catch(mapProviderError('prebook')),
    );
    if (!pb.bookable || pb.price_farm == null)
      throw new ServiceUnavailableException(
        'This room cannot be priced in FARM right now',
      );
    if (pb.live_mode && this.env.TRAVEL_ALLOW_LIVE !== 'true')
      throw new ForbiddenException('Live bookings are disabled');
    if (pb.price_farm > Number(dto.expected_total_farm) + 0.001)
      throw new ConflictException({
        message: 'The price changed. Please review the new price.',
        price_farm: pb.price_farm,
      });
    const total = pb.price_farm;
    // Display-only hotel details for the bookings list. Never blocks booking.
    const info = this.hotels.hotelInfo
      ? await this.hotels.hotelInfo(pb.hotel_id).catch(() => null)
      : null;

    const booking = await this.travel.holdAndCreate(userId, key, ip, {
      total,
      fee: pb.service_fee_farm ?? 0,
      description: `Hotel ${pb.checkin} to ${pb.checkout}`,
      ledger: 'Hotel booking (held)',
      metadata: {
        kind: 'travel_hotel',
        provider: this.hotels.name,
        prebook_id: pb.prebook_id,
      },
      booking: {
        kind: 'hotel',
        provider: this.hotels.name,
        provider_offer_id: pb.prebook_id,
        offer_currency: pb.total_currency,
        offer_amount: pb.total_amount,
        fx_rate: pb.fx_rate,
        live_mode: pb.live_mode,
        summary: {
          hotel_id: pb.hotel_id,
          hotel_name: info?.name ?? null,
          hotel_address: info?.address ?? null,
          hotel_city: info?.city ?? null,
          room_name: pb.room_name ?? null,
          board: pb.board ?? null,
          checkin: pb.checkin,
          checkout: pb.checkout,
          refundable: pb.refundable,
          cancel_policies: pb.cancel_policies,
        } as object,
        passengers: [
          { given_name: nm(g.first_name), family_name: nm(g.last_name) },
        ] as object,
      },
    });
    if (booking._existing) return this.travel.view(booking);

    try {
      const order = await this.hotels.book(
        pb.prebook_id,
        {
          first_name: nm(g.first_name),
          last_name: nm(g.last_name),
          email: nm(g.email),
          phone: nm(g.phone),
        },
        booking.id,
      );
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.transactions.update({
          where: { id: booking.transaction_id },
          data: { status: 'completed', processed_at: new Date() },
        });
        return tx.travel_bookings.update({
          where: { id: booking.id },
          data: {
            status: 'confirmed',
            provider_order_id: order.id,
            booking_reference: order.confirmation_code ?? order.id,
          },
        });
      });
      this.travel.notify(
        done.user_id,
        'Hotel booked',
        `Confirmation ${done.booking_reference ?? '-'}.`,
        done.id,
      );
      return this.travel.view(done);
    } catch (e) {
      if (e instanceof ProviderUnknownError) {
        this.log.error(
          `Hotel booking ${booking.id} outcome unknown: ${e.message}`,
        );
        const b = await this.prisma.travel_bookings.update({
          where: { id: booking.id },
          data: {
            status: 'needs_review',
            failure_reason: e.message.slice(0, 200),
          },
        });
        this.travel.notify(
          b.user_id,
          'Booking under review',
          'We are confirming your hotel. Your payment is held safely.',
          b.id,
        );
        return this.travel.view(b);
      }
      const b = await this.travel.refundTx(
        booking.id,
        (e as Error).message?.slice(0, 200) ?? 'Booking failed',
        { label: 'Hotel booking refund' },
      );
      return this.travel.view(b);
    }
  }

  /** Cancels a confirmed hotel booking; refunds FARM pro-rata to the amount the provider confirms refunded. */
  async cancel(userId: string, id: string) {
    this.ensure();
    const b = await this.prisma.travel_bookings.findFirst({
      where: { id, user_id: userId, kind: 'hotel' },
    });
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'confirmed' || !b.provider_order_id)
      throw new BadRequestException('Only confirmed bookings can be cancelled');
    const claim = await this.prisma.travel_bookings.updateMany({
      where: { id, status: 'confirmed' },
      data: { status: 'cancelling' },
    });
    if (claim.count !== 1)
      throw new ConflictException('Cancellation already in progress');
    let res;
    try {
      res = await this.hotels.cancel(b.provider_order_id);
    } catch (e) {
      const unknown = e instanceof ProviderUnknownError;
      const out = await this.prisma.travel_bookings.update({
        where: { id },
        data: {
          status: unknown ? 'needs_review' : 'confirmed',
          failure_reason: `cancel: ${(e as Error).message}`.slice(0, 200),
        },
      });
      if (!unknown)
        throw new BadRequestException(
          'The hotel did not accept the cancellation',
        );
      return this.travel.view(out);
    }
    if (!/cancel/i.test(res.status)) {
      const out = await this.prisma.travel_bookings.update({
        where: { id },
        data: {
          status: 'needs_review',
          failure_reason: `cancel status ${res.status}`.slice(0, 200),
        },
      });
      return this.travel.view(out);
    }
    const offerAmt = Number(b.offer_amount);
    const ratio =
      offerAmt > 0 ? Math.max(0, Math.min(1, res.refund_amount / offerAmt)) : 0;
    const farm = Math.floor(Number(b.total_farm) * ratio * 100) / 100;
    const out = await this.travel.refundTx(
      id,
      `cancelled; provider refund ${res.refund_amount} ${res.currency}, fee ${res.cancellation_fee}`,
      {
        from: ['cancelling'],
        status: 'cancelled',
        amount: farm,
        label: 'Hotel cancellation refund',
      },
    );
    this.travel.notify(
      userId,
      'Hotel cancelled',
      farm > 0
        ? `${farm} FARM was returned to your wallet.`
        : 'This rate was non-refundable.',
      id,
    );
    return this.travel.view(out);
  }
}
