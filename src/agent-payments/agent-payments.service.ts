import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { WalletsService } from '../wallets/wallets.service';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { BusinessFinanceService } from '../business-ops/business-finance.service';
import { BusinessWebhooksService } from '../business-ops/business-webhooks.service';
import { generateTxReference } from '../common/utils/reference.util';

type Row = { [k: string]: any };
export interface BizCtx {
  businessId: string;
  ownerUserId: string;
  actorUserId?: string | null;
  live: boolean;
}
export interface IntentDto {
  amount: number;
  description?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  expires_in_minutes?: number;
}
export interface MandateDto {
  business_id: string;
  per_tx_cap: number;
  daily_cap: number;
  monthly_cap: number;
  expires_in_days: number;
  label?: string;
  pin: string;
}

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = startOfDay();
  d.setDate(1);
  return d;
};
const ACTIVE_REQ = ['pending', 'processing', 'confirmed'];

/**
 * Phase 9: payment intents, refunds and agent mandates.
 * All money moves server-side. Payments always need the payer's PIN (via WalletsService.sendFunds);
 * agents and Mkulima can only *request* within caps — the user confirms each payment with their PIN.
 */
@Injectable()
export class AgentPaymentsService {
  private readonly log = new Logger(AgentPaymentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly wallets: WalletsService,
    private readonly access: BusinessAccessService,
    private readonly finance: BusinessFinanceService,
    private readonly webhooks: BusinessWebhooksService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private get env() {
    return process.env;
  }
  enabled() {
    return this.env.AGENT_PAYMENTS_ENABLED === 'true';
  }
  private ensure() {
    if (!this.enabled())
      throw new ServiceUnavailableException(
        'Agent payments are not enabled yet',
      );
  }
  limits() {
    const n = (k: string, d: number) => {
      const v = Number(this.env[k]);
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    return {
      max_per_tx: n('AGENT_MAX_PER_TX_FARM', 50_000),
      max_monthly: n('AGENT_MAX_MONTHLY_FARM', 200_000),
      request_ttl_min: Math.min(n('AGENT_REQUEST_TTL_MIN', 30), 24 * 60),
      intent_ttl_min: Math.min(n('PAYMENT_INTENT_TTL_MIN', 60), 7 * 24 * 60),
    };
  }
  status() {
    return { enabled: this.enabled(), limits: this.limits() };
  }

  private async businessName(id: string) {
    const b = await this.prisma.businesses.findUnique({
      where: { id },
      select: {
        id: true,
        trading_name: true,
        legal_name: true,
        owner_user_id: true,
        status: true,
      },
    });
    if (!b) throw new NotFoundException('Business not found');
    return { ...b, name: b.trading_name || b.legal_name || 'Business' };
  }

  // ------------------------- payment intents -------------------------
  intentView(i: Row) {
    return {
      id: i.id,
      object: 'payment_intent',
      live_mode: i.live_mode,
      status: i.status,
      amount: num(i.amount),
      amount_refunded: num(i.amount_refunded),
      currency: i.currency,
      description: i.description,
      reference: i.reference,
      metadata: i.metadata ?? null,
      transaction_reference: i.transaction_reference,
      expires_at: i.expires_at,
      paid_at: i.paid_at,
      created_at: i.created_at,
    };
  }

  private async expireIntents(where: Row) {
    await this.prisma.payment_intents.updateMany({
      where: {
        ...where,
        status: 'requires_payment',
        expires_at: { lte: new Date() },
      },
      data: { status: 'expired' },
    });
  }

  async createIntent(ctx: BizCtx, dto: IntentDto, idem?: string) {
    this.ensure();
    const amount = r2(Number(dto.amount));
    if (!(amount >= 1) || amount > 1e9)
      throw new BadRequestException(
        'amount must be between 1 and 1,000,000,000 FARM',
      );
    if (idem) {
      const ex = await this.prisma.payment_intents.findUnique({
        where: {
          business_id_idempotency_key: {
            business_id: ctx.businessId,
            idempotency_key: idem,
          },
        },
      });
      if (ex) {
        if (num(ex.amount) !== amount)
          throw new ConflictException(
            'Idempotency-Key was used with different parameters',
          );
        return this.intentView(ex);
      }
    }
    const ttl = Math.min(
      Math.max(
        Math.floor(dto.expires_in_minutes ?? this.limits().intent_ttl_min),
        5,
      ),
      7 * 24 * 60,
    );
    try {
      const i = await this.prisma.payment_intents.create({
        data: {
          business_id: ctx.businessId,
          created_by: ctx.actorUserId ?? null,
          live_mode: ctx.live,
          amount,
          description: dto.description?.slice(0, 255) ?? null,
          reference: dto.reference?.slice(0, 100) ?? null,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
          idempotency_key: idem ?? null,
          expires_at: new Date(Date.now() + ttl * 60_000),
        },
      });
      return this.intentView(i);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002' && idem) {
        const ex = await this.prisma.payment_intents.findUnique({
          where: {
            business_id_idempotency_key: {
              business_id: ctx.businessId,
              idempotency_key: idem,
            },
          },
        });
        if (ex) return this.intentView(ex);
      }
      throw e;
    }
  }

  async listIntents(businessId: string, live: boolean, status?: string) {
    await this.expireIntents({ business_id: businessId });
    const rows = await this.prisma.payment_intents.findMany({
      where: {
        business_id: businessId,
        live_mode: live,
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.intentView(r));
  }

  private async ownIntent(businessId: string, id: string, live?: boolean) {
    await this.expireIntents({ id });
    const i = await this.prisma.payment_intents.findUnique({ where: { id } });
    if (
      !i ||
      i.business_id !== businessId ||
      (live !== undefined && i.live_mode !== live)
    )
      throw new NotFoundException('Payment intent not found');
    return i;
  }
  async getIntent(businessId: string, id: string, live?: boolean) {
    return this.intentView(await this.ownIntent(businessId, id, live));
  }

  async cancelIntent(businessId: string, id: string, live?: boolean) {
    await this.ownIntent(businessId, id, live);
    const r = await this.prisma.payment_intents.updateMany({
      where: { id, status: 'requires_payment' },
      data: { status: 'canceled', canceled_at: new Date() },
    });
    if (!r.count)
      throw new ConflictException('Only unpaid intents can be canceled');
    await this.prisma.agent_payment_requests.updateMany({
      where: { intent_id: id, status: 'pending' },
      data: { status: 'canceled', decided_at: new Date() },
    });
    return this.getIntent(businessId, id);
  }

  /** Sandbox only: mark a test intent as paid. No money moves. */
  async simulateIntent(businessId: string, id: string) {
    const i = await this.ownIntent(businessId, id, false);
    const r = await this.prisma.payment_intents.updateMany({
      where: { id: i.id, live_mode: false, status: 'requires_payment' },
      data: { status: 'succeeded', paid_at: new Date() },
    });
    if (!r.count) throw new ConflictException(`Intent is ${i.status}`);
    this.webhooks.emit(businessId, 'sandbox', 'payment_intent.succeeded', {
      payment_intent_id: id,
      amount: num(i.amount),
    });
    return this.getIntent(businessId, id);
  }

  /** What a payer sees before paying. */
  async publicIntent(id: string) {
    this.ensure();
    await this.expireIntents({ id });
    const i = await this.prisma.payment_intents.findUnique({ where: { id } });
    if (!i || !i.live_mode) throw new NotFoundException('Payment not found');
    const b = await this.businessName(i.business_id);
    return {
      id: i.id,
      business_id: i.business_id,
      business_name: b.name,
      amount: num(i.amount),
      currency: i.currency,
      description: i.description,
      reference: i.reference,
      status: i.status,
      expires_at: i.expires_at,
    };
  }

  /** Payer pays an intent with their PIN. Used directly, by agent-request confirmation and by Mkulima confirmation. */
  async payIntent(
    payerId: string,
    id: string,
    pin: string,
    ip: string,
    channel = 'app',
  ) {
    this.ensure();
    if (!pin) throw new BadRequestException('Transaction PIN is required');
    await this.expireIntents({ id });
    const i = await this.prisma.payment_intents.findUnique({ where: { id } });
    if (!i || !i.live_mode) throw new NotFoundException('Payment not found');
    if (i.status === 'succeeded' && i.payer_user_id === payerId)
      return this.intentView(i);
    if (i.status !== 'requires_payment')
      throw new GoneException(`This payment is ${i.status.replace('_', ' ')}`);
    const b = await this.businessName(i.business_id);
    if (b.owner_user_id === payerId)
      throw new ForbiddenException('You cannot pay your own business');
    const claim = await this.prisma.payment_intents.updateMany({
      where: { id, status: 'requires_payment', expires_at: { gt: new Date() } },
      data: { status: 'processing', payer_user_id: payerId },
    });
    if (!claim.count)
      throw new GoneException('This payment is no longer payable');
    const amount = num(i.amount);
    let ref: string;
    try {
      const w = await this.finance.walletFor(b.owner_user_id);
      const res = await this.wallets.sendFunds(
        payerId,
        {
          recipient_identifier: w.wallet_address,
          amount,
          pin,
          description:
            `Payment to ${b.name}${i.description ? `: ${i.description}` : ''}`.slice(
              0,
              255,
            ),
        },
        ip,
      );
      ref = (res as { data: { transaction_reference: string } }).data
        .transaction_reference;
    } catch (e) {
      await this.prisma.payment_intents.updateMany({
        where: { id, status: 'processing' },
        data: { status: 'requires_payment', payer_user_id: null },
      });
      throw e;
    }
    const done = await this.prisma.payment_intents.update({
      where: { id },
      data: {
        status: 'succeeded',
        transaction_reference: ref,
        paid_at: new Date(),
      },
    });
    await this.prisma.business_payments.create({
      data: {
        business_id: i.business_id,
        source: 'payment_intent',
        source_id: i.id,
        payer_user_id: payerId,
        amount,
        transaction_reference: ref,
        channel,
      },
    });
    this.webhooks.emit(i.business_id, 'live', 'payment_intent.succeeded', {
      payment_intent_id: id,
      amount,
      reference: i.reference,
      transaction_reference: ref,
      channel,
    });
    return this.intentView(done);
  }

  // ------------------------- refunds -------------------------
  refundView(r: Row) {
    return {
      id: r.id,
      object: 'refund',
      payment_intent_id: r.intent_id,
      live_mode: r.live_mode,
      amount: num(r.amount),
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
    };
  }

  async listRefunds(businessId: string, intentId: string, live?: boolean) {
    await this.ownIntent(businessId, intentId, live);
    const rows = await this.prisma.payment_refunds.findMany({
      where: { intent_id: intentId },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => this.refundView(r));
  }

  /** Dashboard refund: needs refund-capable role and the actor's PIN. */
  async refundFromDashboard(
    userId: string,
    intentId: string,
    dto: { amount?: number; reason?: string; pin: string },
    idem?: string,
  ) {
    const a = await this.access.resolve(userId, 'payouts:create');
    await this.auth.verifyPin(userId, dto.pin);
    return this.refund(
      {
        businessId: a.business.id,
        ownerUserId: a.business.owner_user_id,
        actorUserId: userId,
        live: true,
      },
      intentId,
      dto,
      idem,
    );
  }

  /** Business wallet → payer wallet, atomically, never more than was paid. */
  async refund(
    ctx: BizCtx,
    intentId: string,
    dto: { amount?: number; reason?: string },
    idem?: string,
  ) {
    this.ensure();
    if (idem) {
      const ex = await this.prisma.payment_refunds.findUnique({
        where: {
          business_id_idempotency_key: {
            business_id: ctx.businessId,
            idempotency_key: idem,
          },
        },
      });
      if (ex) return this.refundView(ex);
    }
    const i = await this.ownIntent(ctx.businessId, intentId, ctx.live);
    if (!['succeeded', 'partially_refunded'].includes(i.status))
      throw new ConflictException('Only paid intents can be refunded');
    const remaining = r2(num(i.amount) - num(i.amount_refunded));
    const amt = r2(dto.amount == null ? remaining : Number(dto.amount));
    if (!(amt > 0))
      throw new BadRequestException('Refund amount must be positive');
    if (amt > remaining + 1e-9)
      throw new BadRequestException(
        `At most ${remaining} FARM can still be refunded`,
      );
    const newRefunded = r2(num(i.amount_refunded) + amt);
    const status =
      newRefunded >= num(i.amount) - 1e-9 ? 'refunded' : 'partially_refunded';
    const reason = dto.reason?.slice(0, 255) ?? null;

    const out = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock on amount_refunded prevents concurrent over-refunds.
      const claim = await tx.payment_intents.updateMany({
        where: {
          id: i.id,
          amount_refunded: i.amount_refunded,
          status: i.status,
        },
        data: { amount_refunded: newRefunded, status },
      });
      if (claim.count !== 1)
        throw new ConflictException('The payment changed; try again');
      let transactionId: string | null = null;
      if (ctx.live) {
        const from = await tx.wallets.findFirst({
          where: { user_id: ctx.ownerUserId, is_active: true },
        });
        const to = await tx.wallets.findFirst({
          where: { user_id: i.payer_user_id!, is_active: true },
        });
        if (!from || !to) throw new NotFoundException('Wallet not found');
        if (from.is_frozen)
          throw new ForbiddenException('Business wallet is frozen');
        const debit = await tx.wallets.updateMany({
          where: { id: from.id, balance: { gte: amt } },
          data: { balance: { decrement: amt } },
        });
        if (debit.count !== 1)
          throw new BadRequestException(
            'Insufficient business balance for this refund',
          );
        await tx.wallets.update({
          where: { id: to.id },
          data: { balance: { increment: amt } },
        });
        const t = await tx.transactions.create({
          data: {
            transaction_reference: generateTxReference(),
            sender_wallet_id: from.id,
            receiver_wallet_id: to.id,
            transaction_type: 'transfer',
            status: 'completed',
            amount: amt,
            fee: 0,
            net_amount: amt,
            currency: 'FARM',
            description: `Refund${reason ? `: ${reason}` : ''}`.slice(0, 255),
            processed_at: new Date(),
            metadata: {
              kind: 'payment_refund',
              payment_intent_id: i.id,
              business_id: ctx.businessId,
            },
          },
        });
        transactionId = t.id;
        await tx.ledger_entries.create({
          data: {
            transaction_id: t.id,
            wallet_id: from.id,
            entry_type: 'debit',
            amount: amt,
            balance_before: num(from.balance),
            balance_after: num(from.balance) - amt,
            description: 'Payment refund',
          },
        });
        await tx.ledger_entries.create({
          data: {
            transaction_id: t.id,
            wallet_id: to.id,
            entry_type: 'credit',
            amount: amt,
            balance_before: num(to.balance),
            balance_after: num(to.balance) + amt,
            description: 'Payment refund',
          },
        });
      }
      return tx.payment_refunds.create({
        data: {
          intent_id: i.id,
          business_id: ctx.businessId,
          created_by: ctx.actorUserId ?? null,
          live_mode: ctx.live,
          amount: amt,
          reason,
          transaction_id: transactionId,
          idempotency_key: idem ?? null,
        },
      });
    });
    this.webhooks.emit(
      ctx.businessId,
      ctx.live ? 'live' : 'sandbox',
      'refund.succeeded',
      { refund_id: out.id, payment_intent_id: i.id, amount: amt },
    );
    return this.refundView(out);
  }

  // ------------------------- agent mandates -------------------------
  mandateView(m: Row, businessName?: string) {
    return {
      id: m.id,
      object: 'agent_authorization',
      business_id: m.business_id,
      business_name: businessName,
      label: m.label,
      per_tx_cap: num(m.per_tx_cap),
      daily_cap: num(m.daily_cap),
      monthly_cap: num(m.monthly_cap),
      status:
        m.status !== 'active'
          ? m.status
          : m.expires_at <= new Date()
            ? 'expired'
            : 'active',
      expires_at: m.expires_at,
      revoked_at: m.revoked_at,
      created_at: m.created_at,
    };
  }

  async createMandate(userId: string, dto: MandateDto) {
    this.ensure();
    await this.auth.verifyPin(userId, dto.pin);
    const b = await this.businessName(dto.business_id).catch(() => {
      throw new NotFoundException('Business not found');
    });
    if (b.status !== 'approved')
      throw new BadRequestException('This business is not verified');
    if (b.owner_user_id === userId)
      throw new BadRequestException('You cannot authorize your own business');
    const L = this.limits();
    const per = r2(dto.per_tx_cap),
      day = r2(dto.daily_cap),
      mon = r2(dto.monthly_cap);
    if (!(per > 0) || per > L.max_per_tx)
      throw new BadRequestException(
        `Per-payment limit must be between 1 and ${L.max_per_tx} FARM`,
      );
    if (day < per)
      throw new BadRequestException(
        'Daily limit must be at least the per-payment limit',
      );
    if (mon < day)
      throw new BadRequestException(
        'Monthly limit must be at least the daily limit',
      );
    if (mon > L.max_monthly)
      throw new BadRequestException(
        `Monthly limit cannot exceed ${L.max_monthly} FARM`,
      );
    const days = Math.floor(dto.expires_in_days);
    if (!(days >= 1 && days <= 365))
      throw new BadRequestException('Expiry must be 1–365 days');
    const m = await this.prisma.agent_authorizations.create({
      data: {
        user_id: userId,
        business_id: b.id,
        label: dto.label?.trim().slice(0, 100) || null,
        per_tx_cap: per,
        daily_cap: day,
        monthly_cap: mon,
        expires_at: new Date(Date.now() + days * 86_400_000),
      },
    });
    this.webhooks.emit(b.id, 'live', 'agent_authorization.created', {
      authorization_id: m.id,
      label: m.label,
      per_tx_cap: per,
      daily_cap: day,
      monthly_cap: mon,
      expires_at: m.expires_at,
    });
    return this.mandateView(m, b.name);
  }

  async myMandates(userId: string) {
    const rows = await this.prisma.agent_authorizations.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const names = new Map<string, string>();
    for (const r of rows)
      if (!names.has(r.business_id))
        names.set(
          r.business_id,
          (
            await this.businessName(r.business_id).catch(() => ({
              name: 'Business',
            }))
          ).name,
        );
    const out: Row[] = [];
    for (const r of rows) {
      const used = await this.usage(r.id);
      out.push({
        ...this.mandateView(r, names.get(r.business_id)),
        used_today: used.day,
        used_this_month: used.month,
      });
    }
    return out;
  }

  async revokeMandate(userId: string, id: string) {
    const r = await this.prisma.agent_authorizations.updateMany({
      where: { id, user_id: userId, status: 'active' },
      data: { status: 'revoked', revoked_at: new Date() },
    });
    if (!r.count) throw new NotFoundException('Active authorization not found');
    await this.prisma.agent_payment_requests.updateMany({
      where: { authorization_id: id, status: 'pending' },
      data: {
        status: 'canceled',
        decided_at: new Date(),
        failure_reason: 'Authorization revoked',
      },
    });
    const m = await this.prisma.agent_authorizations.findUnique({
      where: { id },
    });
    this.webhooks.emit(m!.business_id, 'live', 'agent_authorization.revoked', {
      authorization_id: id,
    });
    return this.mandateView(m!);
  }

  async businessMandates(businessId: string) {
    const rows = await this.prisma.agent_authorizations.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.mandateView(r));
  }

  private async usage(authorizationId: string, excludeId?: string) {
    const base = {
      authorization_id: authorizationId,
      status: { in: ACTIVE_REQ },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    const [d, m] = await Promise.all([
      this.prisma.agent_payment_requests.aggregate({
        where: { ...base, created_at: { gte: startOfDay() } },
        _sum: { amount: true },
      }),
      this.prisma.agent_payment_requests.aggregate({
        where: { ...base, created_at: { gte: startOfMonth() } },
        _sum: { amount: true },
      }),
    ]);
    return { day: num(d._sum.amount), month: num(m._sum.amount) };
  }

  private async checkCaps(m: Row, amount: number, excludeId?: string) {
    if (m.status !== 'active' || m.expires_at <= new Date())
      throw new ForbiddenException('The authorization is not active');
    if (amount > num(m.per_tx_cap))
      throw new ForbiddenException(
        `Amount exceeds the per-payment limit of ${num(m.per_tx_cap)} FARM`,
      );
    const u = await this.usage(m.id, excludeId);
    if (u.day + amount > num(m.daily_cap))
      throw new ForbiddenException(
        'Amount exceeds the daily limit for this authorization',
      );
    if (u.month + amount > num(m.monthly_cap))
      throw new ForbiddenException(
        'Amount exceeds the monthly limit for this authorization',
      );
  }

  // ------------------------- agent payment requests -------------------------
  requestView(r: Row, extra: Row = {}) {
    return {
      id: r.id,
      object: 'agent_payment_request',
      authorization_id: r.authorization_id,
      payment_intent_id: r.intent_id,
      amount: num(r.amount),
      status:
        r.status !== 'pending'
          ? r.status
          : r.expires_at <= new Date()
            ? 'expired'
            : 'pending',
      failure_reason: r.failure_reason,
      transaction_reference: r.transaction_reference,
      expires_at: r.expires_at,
      decided_at: r.decided_at,
      created_at: r.created_at,
      ...extra,
    };
  }

  /** A business's agent asks the user to pay an intent under a mandate. Live keys only. */
  async createAgentRequest(
    ctx: BizCtx,
    dto: { authorization_id: string; payment_intent_id: string },
    idem?: string,
  ) {
    this.ensure();
    if (!ctx.live)
      throw new BadRequestException(
        'Agent payment requests need a live key (sandbox intents cannot be paid)',
      );
    if (idem) {
      const ex = await this.prisma.agent_payment_requests.findUnique({
        where: {
          business_id_idempotency_key: {
            business_id: ctx.businessId,
            idempotency_key: idem,
          },
        },
      });
      if (ex) return this.requestView(ex);
    }
    const m = await this.prisma.agent_authorizations.findUnique({
      where: { id: dto.authorization_id },
    });
    if (!m || m.business_id !== ctx.businessId)
      throw new NotFoundException('Authorization not found');
    const i = await this.ownIntent(ctx.businessId, dto.payment_intent_id, true);
    if (i.status !== 'requires_payment')
      throw new ConflictException(`Payment intent is ${i.status}`);
    const amount = num(i.amount);
    await this.checkCaps(m, amount);
    const open = await this.prisma.agent_payment_requests.findFirst({
      where: { intent_id: i.id, status: { in: ['pending', 'processing'] } },
    });
    if (open) return this.requestView(open);
    const ttl = this.limits().request_ttl_min * 60_000;
    const exp = new Date(Math.min(Date.now() + ttl, i.expires_at.getTime()));
    const r = await this.prisma.agent_payment_requests.create({
      data: {
        authorization_id: m.id,
        user_id: m.user_id,
        business_id: ctx.businessId,
        intent_id: i.id,
        amount,
        idempotency_key: idem ?? null,
        expires_at: exp,
      },
    });
    if (this.notifications)
      Promise.resolve(
        this.notifications.createInApp(m.user_id, {
          type: 'payment_request',
          title: 'Payment awaiting your approval',
          body: `An agent requested ${amount} FARM. Confirm or reject it with your PIN.`,
          entityId: r.id,
          metadata: { kind: 'agent_payment_request' },
        }),
      ).catch(() => undefined);
    this.webhooks.emit(ctx.businessId, 'live', 'agent_payment.requested', {
      request_id: r.id,
      authorization_id: m.id,
      payment_intent_id: i.id,
      amount,
    });
    return this.requestView(r);
  }

  async businessGetRequest(businessId: string, id: string) {
    const r = await this.prisma.agent_payment_requests.findUnique({
      where: { id },
    });
    if (!r || r.business_id !== businessId)
      throw new NotFoundException('Request not found');
    return this.requestView(r);
  }

  async myRequests(userId: string, status?: string) {
    await this.prisma.agent_payment_requests.updateMany({
      where: {
        user_id: userId,
        status: 'pending',
        expires_at: { lte: new Date() },
      },
      data: { status: 'expired' },
    });
    const rows = await this.prisma.agent_payment_requests.findMany({
      where: { user_id: userId, ...(status ? { status } : {}) },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const out: Row[] = [];
    for (const r of rows) {
      const i = await this.prisma.payment_intents.findUnique({
        where: { id: r.intent_id },
      });
      const b = await this.businessName(r.business_id).catch(() => ({
        name: 'Business',
      }));
      out.push(
        this.requestView(r, {
          business_name: b.name,
          description: i?.description ?? null,
          reference: i?.reference ?? null,
        }),
      );
    }
    return out;
  }

  async rejectRequest(userId: string, id: string) {
    const r = await this.prisma.agent_payment_requests.updateMany({
      where: { id, user_id: userId, status: 'pending' },
      data: { status: 'rejected', decided_at: new Date() },
    });
    if (!r.count) throw new NotFoundException('Pending request not found');
    const row = await this.prisma.agent_payment_requests.findUnique({
      where: { id },
    });
    this.webhooks.emit(row!.business_id, 'live', 'agent_payment.rejected', {
      request_id: id,
      payment_intent_id: row!.intent_id,
    });
    return this.requestView(row!);
  }

  /** The user approves an agent's request with their PIN. Caps are re-checked at this moment. */
  async confirmRequest(userId: string, id: string, pin: string, ip: string) {
    this.ensure();
    const r = await this.prisma.agent_payment_requests.findUnique({
      where: { id },
    });
    if (!r || r.user_id !== userId)
      throw new NotFoundException('Request not found');
    if (r.status === 'confirmed') return this.requestView(r);
    if (r.status !== 'pending')
      throw new ConflictException(`Request is ${r.status}`);
    if (r.expires_at <= new Date()) {
      await this.prisma.agent_payment_requests.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'expired' },
      });
      throw new GoneException('This request has expired');
    }
    const claim = await this.prisma.agent_payment_requests.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'processing' },
    });
    if (!claim.count)
      throw new ConflictException('Request is already being processed');
    try {
      const m = await this.prisma.agent_authorizations.findUnique({
        where: { id: r.authorization_id },
      });
      if (!m) throw new ForbiddenException('The authorization is not active');
      await this.checkCaps(m, num(r.amount), r.id);
      const paid = await this.payIntent(userId, r.intent_id, pin, ip, 'agent');
      const done = await this.prisma.agent_payment_requests.update({
        where: { id },
        data: {
          status: 'confirmed',
          decided_at: new Date(),
          transaction_reference: paid.transaction_reference,
          failure_reason: null,
        },
      });
      this.webhooks.emit(r.business_id, 'live', 'agent_payment.confirmed', {
        request_id: id,
        payment_intent_id: r.intent_id,
        amount: num(r.amount),
        transaction_reference: paid.transaction_reference,
      });
      return this.requestView(done);
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 255) ?? 'Payment failed';
      // Wrong PIN / temporary errors leave the request pending so the user can retry; final states fail it.
      const final =
        e instanceof GoneException ||
        (e instanceof ForbiddenException && !/PIN/i.test(msg));
      await this.prisma.agent_payment_requests.update({
        where: { id },
        data: {
          status: final ? 'failed' : 'pending',
          failure_reason: msg,
          ...(final ? { decided_at: new Date() } : {}),
        },
      });
      throw e;
    }
  }
}
