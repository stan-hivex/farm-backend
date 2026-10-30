import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { RateService } from '../chain-wallet/rate.service';
import { generateTxReference } from '../common/utils/reference.util';
import { Inject } from '@nestjs/common';
import type { FlightProvider } from './travel-provider';
import { FLIGHT_PROVIDER, FlightOffer, FlightSearch, Passenger, ProviderRejectedError, ProviderUnknownError } from './travel-provider';

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2up = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

export interface BookDto {
  offer_id: string;
  passengers: Passenger[];
  expected_total_farm: number;
  pin: string;
  idempotency_key: string;
  ai_action_id?: string;
}

@Injectable()
export class TravelService {
  private readonly log = new Logger(TravelService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly rates: RateService,
    @Inject(FLIGHT_PROVIDER) private readonly flights: FlightProvider,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Centralized in-app notification; never blocks or fails a booking. */
  notify(userId: string, title: string, body: string, entityId: string) {
    if (!this.notifications) return;
    Promise.resolve(this.notifications.createInApp(userId, { type: 'transaction', title, body, entityId, metadata: { kind: 'travel_booking' } })).catch(() => undefined);
  }

  private get env(): NodeJS.ProcessEnv {
    return process.env;
  }

  enabled() {
    return this.env.TRAVEL_ENABLED === 'true' && this.flights.isConfigured();
  }
  status() {
    const on = this.enabled();
    return {
      enabled: on,
      flights: on ? { provider: this.flights.name, sandbox: this.flights.isSandbox() } : null,
      stays: null,
    };
  }
  private ensure() {
    if (!this.enabled()) throw new ServiceUnavailableException('Travel is not available yet');
  }

  /** FARM price for a provider price. KES is 1:1; USD uses the configured USDC/KES mid + markup; other currencies are unavailable. */
  async priceFarm(amount: number, currency: string) {
    const fee = Math.max(Number(this.env.TRAVEL_SERVICE_FEE_FARM ?? 0) || 0, 0);
    if (currency === 'KES') return { fx_rate: 1, fee, total: round2up(amount + fee) };
    if (currency === 'USD') {
      const r = await this.rates.usdcKes(this.env);
      if (!r?.mid) return null;
      const markup = Math.min(Math.max(Number(this.env.TRAVEL_FX_MARKUP_BPS ?? 200) || 0, 0), 1000);
      const fx = Math.ceil(r.mid * (1 + markup / 10_000) * 1e6) / 1e6;
      return { fx_rate: fx, fee, total: round2up(amount * fx + fee) };
    }
    return null;
  }

  private async withPrice(o: FlightOffer) {
    const p = await this.priceFarm(o.total_amount, o.total_currency);
    return { ...o, price_farm: p?.total ?? null, fx_rate: p?.fx_rate ?? null, service_fee_farm: p?.fee ?? null, bookable: !!p };
  }

  validateSearch(q: FlightSearch) {
    const origin = String(q.origin ?? '').toUpperCase().trim();
    const destination = String(q.destination ?? '').toUpperCase().trim();
    if (!IATA.test(origin) || !IATA.test(destination) || origin === destination)
      throw new BadRequestException('Use 3-letter airport codes, e.g. NBO and MBA');
    if (!DATE.test(q.departure_date)) throw new BadRequestException('Departure date must be YYYY-MM-DD');
    const today = new Date().toISOString().slice(0, 10);
    if (q.departure_date < today) throw new BadRequestException('Departure date is in the past');
    if (q.return_date && (!DATE.test(q.return_date) || q.return_date < q.departure_date))
      throw new BadRequestException('Return date must be on or after departure');
    const adults = Math.trunc(Number(q.adults ?? 1));
    if (!(adults >= 1 && adults <= 9)) throw new BadRequestException('1 to 9 adults');
    const cabin = q.cabin_class ?? 'economy';
    if (!['economy', 'premium_economy', 'business', 'first'].includes(cabin)) throw new BadRequestException('Unknown cabin');
    return { origin, destination, departure_date: q.departure_date, return_date: q.return_date || undefined, adults, cabin_class: cabin };
  }

  async search(q: FlightSearch) {
    this.ensure();
    const offers = await this.flights.searchFlights(this.validateSearch(q)).catch((e) => {
      if (e instanceof ProviderRejectedError) throw new BadRequestException(e.message);
      throw new ServiceUnavailableException('Flight search is unavailable right now');
    });
    return Promise.all(offers.map(async (o) => TravelService.strip(await this.withPrice(o))));
  }

  static strip<T extends { provider_data?: unknown }>(o: T): Omit<T, 'provider_data'> {
    const { provider_data: _pd, ...rest } = o;
    return rest;
  }

  async offer(id: string) {
    return TravelService.strip(await this.offerFull(id));
  }

  private async offerFull(id: string) {
    this.ensure();
    if (!/^[A-Za-z0-9_-]{5,1500}$/.test(id)) throw new BadRequestException('Invalid offer id');
    const o = await this.flights.getOffer(id).catch((e) => {
      if (e instanceof NotFoundException) throw e;
      if (e instanceof ProviderRejectedError) throw new BadRequestException(e.message);
      throw new ServiceUnavailableException('Offer lookup is unavailable right now');
    });
    return this.withPrice(o);
  }

  private validatePassengers(offer: FlightOffer, list: Passenger[]) {
    if (!Array.isArray(list) || list.length !== offer.passengers.length)
      throw new BadRequestException(`Details for ${offer.passengers.length} passenger(s) are required`);
    const ids = new Set(offer.passengers.map((p) => p.id));
    return list.map((p) => {
      if (!ids.has(p.id)) throw new BadRequestException('Passenger does not match the offer');
      if (!['mr', 'ms', 'mrs', 'miss', 'dr'].includes(p.title)) throw new BadRequestException('Invalid title');
      if (!['m', 'f'].includes(p.gender)) throw new BadRequestException('Invalid gender');
      if (!DATE.test(p.born_on)) throw new BadRequestException('Date of birth must be YYYY-MM-DD');
      if (!/^\S+@\S+\.\S+$/.test(p.email)) throw new BadRequestException('Invalid email');
      if (!/^\+[1-9]\d{6,14}$/.test(p.phone_number)) throw new BadRequestException('Phone must be in +2547... format');
      const name = (s: string) => String(s ?? '').trim().slice(0, 60);
      if (!name(p.given_name) || !name(p.family_name)) throw new BadRequestException('Passenger names are required');
      const nat = String(p.nationality ?? '').toUpperCase().trim();
      if (nat && !/^[A-Z]{2}$/.test(nat)) throw new BadRequestException('Nationality must be a 2-letter country code');
      return { ...(nat ? { nationality: nat } : {}), id: p.id, title: p.title, gender: p.gender, born_on: p.born_on, email: p.email.trim(), phone_number: p.phone_number, given_name: name(p.given_name), family_name: name(p.family_name) };
    });
  }

  /** AI-proposed bookings must stay within the user's AI caps and allowlist. */
  private async checkAiAction(userId: string, actionId: string, offerId: string, total: number) {
    const a = await this.prisma.ai_action_requests.findFirst({ where: { id: actionId, user_id: userId } });
    if (!a || a.action !== 'book_flight' || a.status !== 'pending' || a.expires_at <= new Date())
      throw new BadRequestException('Mkulima request is not pending');
    if ((a.payload as Record<string, unknown> | null)?.offer_id !== offerId) throw new BadRequestException('Mkulima request is for a different offer');
    const p = await this.prisma.ai_spend_permissions.findUnique({ where: { user_id: userId } });
    if (!p || !p.enabled || p.revoked_at || !p.allowed_actions.includes('book_flight'))
      throw new ForbiddenException('Mkulima flight booking is not allowed in your settings');
    if (total > Number(p.per_tx_cap)) throw new ForbiddenException('Price is above your Mkulima per-payment cap');
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const agg = await this.prisma.ai_action_requests.aggregate({
      where: { user_id: userId, status: 'executed', created_at: { gte: start } },
      _sum: { amount: true },
    });
    if (Number(agg._sum.amount ?? 0) + total > Number(p.daily_cap)) throw new ForbiddenException('Price is above your Mkulima daily cap');
    return a;
  }

  async book(userId: string, dto: BookDto, ip: string) {
    this.ensure();
    const key = String(dto.idempotency_key ?? '').trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new BadRequestException('idempotency_key is required');
    const existing = await this.prisma.travel_bookings.findUnique({ where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } } });
    if (existing) return this.view(existing);

    if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
    await this.auth.verifyPin(userId, dto.pin);

    const offer = await this.offerFull(dto.offer_id);
    if (!offer.bookable || offer.price_farm == null) throw new ServiceUnavailableException('This offer cannot be priced in FARM right now');
    if (offer.live_mode && this.env.TRAVEL_ALLOW_LIVE !== 'true') throw new ForbiddenException('Live bookings are disabled');
    if (offer.price_farm > Number(dto.expected_total_farm) + 0.001)
      throw new ConflictException({ message: 'The price changed. Please review the new price.', price_farm: offer.price_farm });
    const passengers = this.validatePassengers(offer, dto.passengers);
    const total = offer.price_farm;
    if (dto.ai_action_id) await this.checkAiAction(userId, dto.ai_action_id, offer.id, total);

    // 1) Hold: debit the wallet into a processing escrow_lock transaction (atomic, balance re-checked in-tx).
    const booking = await this.holdAndCreate(userId, key, ip, {
      total,
      fee: offer.service_fee_farm ?? 0,
      description: `Flight ${offer.slices.map((s) => `${s.origin}-${s.destination}`).join(', ')}`,
      ledger: 'Flight booking (held)',
      metadata: { kind: 'travel_flight', provider: offer.provider, offer_id: offer.id },
      booking: {
        provider: offer.provider,
        provider_offer_id: offer.id.slice(0, 1500),
        offer_currency: offer.total_currency,
        offer_amount: offer.total_amount,
        fx_rate: offer.fx_rate,
        ai_action_id: dto.ai_action_id ?? null,
        live_mode: offer.live_mode,
        summary: { owner: offer.owner, slices: offer.slices } as object,
        passengers: passengers.map((p) => ({ given_name: p.given_name, family_name: p.family_name })) as object,
      },
    });
    if ((booking as { _existing?: boolean })._existing) return this.view(booking);

    // 2) Book with the provider.
    try {
      const order = await this.flights.createOrder(offer, passengers, booking.id);
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.transactions.update({ where: { id: booking.transaction_id! }, data: { status: 'completed', processed_at: new Date() } });
        if (booking.ai_action_id)
          await tx.ai_action_requests.update({ where: { id: booking.ai_action_id }, data: { status: 'executed', decided_at: new Date(), amount: total } });
        return tx.travel_bookings.update({
          where: { id: booking.id },
          data: { status: 'confirmed', provider_order_id: order.id, booking_reference: order.booking_reference },
        });
      });
      this.notify(done.user_id, 'Flight booked', `Booking reference ${done.booking_reference ?? '-'}.`, done.id);
      return this.view(done);
    } catch (e) {
      if (e instanceof ProviderUnknownError) {
        // Outcome unknown: keep funds held, flag for review; never double-book or refund blindly.
        this.log.error(`Travel booking ${booking.id} outcome unknown: ${e.message}`);
        const b = await this.prisma.travel_bookings.update({ where: { id: booking.id }, data: { status: 'needs_review', failure_reason: e.message.slice(0, 200) } });
        this.notify(b.user_id, 'Booking under review', 'We are confirming your flight with the airline. Your payment is held safely.', b.id);
        return this.view(b);
      }
      const reason = (e as Error).message?.slice(0, 200) ?? 'Booking failed';
      const b = await this.refund(booking.id, reason);
      return this.view(b);
    }
  }

  /**
   * Debits the wallet into a processing escrow_lock transaction and creates the travel_bookings row
   * (atomic, balance re-checked in-tx). On an idempotency race returns the existing row flagged _existing.
   */
  async holdAndCreate(
    userId: string,
    key: string,
    ip: string,
    p: { total: number; fee: number; description: string; ledger: string; metadata: Record<string, unknown>; booking: Record<string, any> },
  ): Promise<any> {
    const total = p.total;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const w = await tx.wallets.findFirst({ where: { user_id: userId, is_active: true } });
        if (!w) throw new NotFoundException('Wallet not found');
        if (w.is_frozen) throw new ForbiddenException('Your wallet is frozen. Contact support.');
        const available = Number(w.balance) - Number(w.locked_balance ?? 0);
        if (available < total) throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
        const upd = await tx.wallets.updateMany({ where: { id: w.id, balance: { gte: total } }, data: { balance: { decrement: total } } });
        if (upd.count !== 1) throw new BadRequestException('Insufficient balance');
        const t = await tx.transactions.create({
          data: {
            transaction_reference: generateTxReference(),
            sender_wallet_id: w.id,
            transaction_type: 'escrow_lock',
            status: 'processing',
            amount: total,
            fee: p.fee,
            net_amount: total - p.fee,
            currency: 'FARM',
            description: p.description,
            ip_address: ip,
            metadata: { user_id: userId, ...p.metadata } as object,
          },
        });
        await tx.ledger_entries.create({
          data: {
            transaction_id: t.id,
            wallet_id: w.id,
            entry_type: 'debit',
            amount: total,
            balance_before: Number(w.balance),
            balance_after: Number(w.balance) - total,
            description: p.ledger,
          },
        });
        return tx.travel_bookings.create({
          data: {
            ...p.booking,
            user_id: userId,
            idempotency_key: key,
            status: 'payment_held',
            service_fee_farm: p.fee,
            total_farm: total,
            transaction_id: t.id,
          } as any,
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        const b = await this.prisma.travel_bookings.findUnique({ where: { user_id_idempotency_key: { user_id: userId, idempotency_key: key } } });
        if (b) return { ...b, _existing: true };
      }
      throw e;
    }
  }

  /** Full refund to the wallet for a booking whose payment is held. Idempotent. */
  async refund(bookingId: string, reason: string) {
    const out = await this.refundTx(bookingId, reason);
    if (out?.status === 'failed_refunded') this.notify(out.user_id, 'Booking refunded', `${Number(out.total_farm)} FARM was returned to your wallet.`, out.id);
    return out;
  }

  /**
   * Returns FARM to the wallet. Default: full refund of a held booking (status failed_refunded).
   * Hotel cancellations pass from=['cancelling'], status='cancelled' and the provider-confirmed amount.
   */
  async refundTx(bookingId: string, reason: string, opts: { from?: string[]; status?: string; amount?: number; label?: string } = {}) {
    const from = opts.from ?? ['payment_held', 'needs_review'];
    const label = opts.label ?? 'Flight booking refund';
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.travel_bookings.findUnique({ where: { id: bookingId } });
      if (!b) throw new NotFoundException('Booking not found');
      const claim = await tx.travel_bookings.updateMany({
        where: { id: bookingId, status: { in: from } },
        data: { status: 'refunding' },
      });
      if (claim.count !== 1) return b;
      const amt = Math.min(opts.amount ?? Number(b.total_farm), Number(b.total_farm));
      if (!(amt > 0)) return tx.travel_bookings.update({ where: { id: b.id }, data: { status: opts.status ?? 'failed_refunded', failure_reason: reason } });
      const hold = await tx.transactions.findUnique({ where: { id: b.transaction_id! } });
      const w = await tx.wallets.findUnique({ where: { id: hold!.sender_wallet_id! } });
      await tx.wallets.update({ where: { id: w!.id }, data: { balance: { increment: amt } } });
      if (!opts.status) await tx.transactions.update({ where: { id: hold!.id }, data: { status: 'reversed', processed_at: new Date() } });
      const r = await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          receiver_wallet_id: w!.id,
          transaction_type: 'escrow_refund',
          status: 'completed',
          amount: amt,
          fee: 0,
          net_amount: amt,
          currency: 'FARM',
          description: label,
          processed_at: new Date(),
          metadata: { user_id: b.user_id, kind: 'travel_refund', booking_id: b.id, hold_tx: hold!.id },
        },
      });
      await tx.ledger_entries.create({
        data: {
          transaction_id: r.id,
          wallet_id: w!.id,
          entry_type: 'credit',
          amount: amt,
          balance_before: Number(w!.balance),
          balance_after: Number(w!.balance) + amt,
          description: label,
        },
      });
      return tx.travel_bookings.update({ where: { id: b.id }, data: { status: opts.status ?? 'failed_refunded', refund_transaction_id: r.id, failure_reason: reason } });
    });
  }

  view(b: { [k: string]: any }) {
    return {
      id: b.id,
      kind: b.kind,
      provider: b.provider,
      status: b.status,
      booking_reference: b.booking_reference,
      total_farm: Number(b.total_farm),
      offer_amount: Number(b.offer_amount),
      offer_currency: b.offer_currency,
      fx_rate: b.fx_rate == null ? null : Number(b.fx_rate),
      service_fee_farm: Number(b.service_fee_farm),
      summary: b.summary,
      passengers: b.passengers,
      failure_reason: b.failure_reason,
      live_mode: b.live_mode,
      created_at: b.created_at,
    };
  }

  async list(userId: string) {
    const rows = await this.prisma.travel_bookings.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take: 50 });
    return rows.map((b) => this.view(b));
  }

  async get(userId: string, id: string) {
    const b = await this.prisma.travel_bookings.findFirst({ where: { id, user_id: userId } });
    if (!b) throw new NotFoundException('Booking not found');
    return this.view(b);
  }
  // ---- Admin review (needs_review / stuck bookings) ----
  async adminList(status?: string) {
    const rows = await this.prisma.travel_bookings.findMany({
      where: status ? { status } : { status: { in: ['needs_review', 'payment_held', 'refunding'] } },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((b) => ({ ...this.view(b), user_id: b.user_id, provider_offer_id: b.provider_offer_id, provider_order_id: b.provider_order_id, updated_at: b.updated_at }));
  }

  /** Operator decision after checking the provider dashboard. Audited. */
  async adminResolve(adminId: string, id: string, dto: { action: 'confirm' | 'refund'; booking_reference?: string; provider_order_id?: string; note: string }, ip?: string) {
    const b = await this.prisma.travel_bookings.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Booking not found');
    if (!['needs_review', 'payment_held'].includes(b.status)) throw new ConflictException(`Booking is ${b.status}; nothing to resolve`);
    const note = (dto.note ?? '').trim();
    if (note.length < 3) throw new BadRequestException('Add a short note explaining the decision');
    let out: { [k: string]: any };
    if (dto.action === 'confirm') {
      const ref = (dto.booking_reference ?? '').trim();
      if (!/^[A-Z0-9]{5,8}$/i.test(ref)) throw new BadRequestException('Enter the airline/provider booking reference (PNR)');
      out = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.travel_bookings.updateMany({
          where: { id, status: { in: ['needs_review', 'payment_held'] } },
          data: { status: 'confirmed', booking_reference: ref.toUpperCase(), provider_order_id: dto.provider_order_id?.trim() || b.provider_order_id, failure_reason: null },
        });
        if (claim.count !== 1) throw new ConflictException('Booking changed; reload');
        await tx.transactions.update({ where: { id: b.transaction_id! }, data: { status: 'completed', processed_at: new Date() } });
        if (b.ai_action_id) await tx.ai_action_requests.update({ where: { id: b.ai_action_id }, data: { status: 'executed', decided_at: new Date() } });
        return tx.travel_bookings.findUnique({ where: { id } });
      }) as { [k: string]: any };
    } else if (dto.action === 'refund') {
      out = await this.refund(id, `Refunded after review: ${note}`.slice(0, 200));
    } else throw new BadRequestException('action must be confirm or refund');
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId, action: `travel_review_${dto.action}`, entity_type: 'travel_booking', entity_id: id,
        old_values: { status: b.status, booking_reference: b.booking_reference },
        new_values: { status: out.status, booking_reference: out.booking_reference ?? null, note },
        ip_address: ip ?? null,
      },
    });
    return this.view(out);
  }

}
