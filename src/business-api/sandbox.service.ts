import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { BusinessWebhooksService } from '../business-ops/business-webhooks.service';
import { paginate, paginationParams } from '../common/utils/pagination.util';

/**
 * Sandbox mode. Everything lives in business_sandbox_objects and never touches
 * wallets, transactions, escrow contracts or payouts. No real money can move here.
 */
export const SANDBOX_NOTICE =
  'Sandbox mode: test data only. No real funds are moved.';

type Kind = 'payment' | 'payment_link' | 'invoice' | 'escrow' | 'payout';

function view(o: any) {
  return {
    id: o.id,
    object: o.object_type,
    status: o.status,
    amount: o.amount == null ? null : Number(o.amount),
    currency: o.currency,
    ...((o.data as object) ?? {}),
    livemode: false,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

@Injectable()
export class SandboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: BusinessWebhooksService,
  ) {}

  async account(businessId: string) {
    const b = await this.prisma.businesses.findUnique({
      where: { id: businessId },
      select: { id: true, legal_name: true, trading_name: true, status: true },
    });
    return {
      livemode: false,
      notice: SANDBOX_NOTICE,
      data: { ...b, balance: null, currency: 'USD' },
    };
  }

  async list(businessId: string, kind: Kind, q: any) {
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = { business_id: businessId, object_type: kind };
    if (q.status) where.status = String(q.status);
    const [items, total] = await Promise.all([
      this.prisma.business_sandbox_objects.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.business_sandbox_objects.count({ where }),
    ]);
    return {
      livemode: false,
      notice: SANDBOX_NOTICE,
      data: items.map(view),
      meta: paginate(total, page, limit),
    };
  }

  async get(businessId: string, kind: Kind, id: string) {
    const o = await this.prisma.business_sandbox_objects.findFirst({
      where: { id, business_id: businessId, object_type: kind },
    });
    if (!o) throw new NotFoundException(`Sandbox ${kind} not found`);
    return o;
  }

  async getView(businessId: string, kind: Kind, id: string) {
    return {
      livemode: false,
      data: view(await this.get(businessId, kind, id)),
    };
  }

  async create(businessId: string, kind: Kind, dto: any, status: string) {
    const { amount, ...rest } = dto ?? {};
    const extra: any = { ...rest };
    if (kind === 'payment_link')
      extra.code = `TEST-${randomBytes(4).toString('hex').toUpperCase()}`;
    if (kind === 'invoice') {
      const items = Array.isArray(rest.items) ? rest.items : [];
      const total = items.reduce(
        (s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price),
        0,
      );
      extra.invoice_number = `TEST-INV-${randomBytes(4).toString('hex').toUpperCase()}`;
      extra.total = Math.round(total * 100) / 100;
    }
    const o = await this.prisma.business_sandbox_objects.create({
      data: {
        business_id: businessId,
        object_type: kind,
        status,
        amount: kind === 'invoice' ? extra.total : (amount ?? null),
        currency: 'USD',
        data: extra,
      },
    });
    return { livemode: false, notice: SANDBOX_NOTICE, data: view(o) };
  }

  async setStatus(
    businessId: string,
    kind: Kind,
    id: string,
    from: string[],
    to: string,
  ) {
    const o = await this.get(businessId, kind, id);
    if (!from.includes(o.status))
      throw new BadRequestException(`Sandbox ${kind} is ${o.status}`);
    const u = await this.prisma.business_sandbox_objects.update({
      where: { id },
      data: { status: to },
    });
    return { livemode: false, data: view(u) };
  }

  /** Simulates a customer paying a sandbox link, invoice or escrow and fires sandbox webhooks. */
  async simulatePayment(
    businessId: string,
    kind: 'payment_link' | 'invoice' | 'escrow',
    id: string,
  ) {
    const o = await this.get(businessId, kind, id);
    const payable: Record<string, string[]> = {
      payment_link: ['active'],
      invoice: ['sent', 'pending', 'overdue'],
      escrow: ['awaiting_payment'],
    };
    if (!payable[kind].includes(o.status))
      throw new BadRequestException(
        `Sandbox ${kind} is ${o.status} and cannot be paid`,
      );
    const ref = `TEST-TX-${randomBytes(6).toString('hex').toUpperCase()}`;
    if (kind !== 'payment_link')
      await this.prisma.business_sandbox_objects.update({
        where: { id },
        data: { status: kind === 'invoice' ? 'paid' : 'funded' },
      });
    const payment = await this.prisma.business_sandbox_objects.create({
      data: {
        business_id: businessId,
        object_type: 'payment',
        status: 'completed',
        amount: o.amount,
        currency: o.currency,
        data: { source: kind, source_id: id, transaction_reference: ref },
      },
    });
    const amount = o.amount == null ? null : Number(o.amount);
    this.webhooks.emit(businessId, 'sandbox', 'payment.succeeded', {
      source: kind,
      source_id: id,
      amount,
      transaction_reference: ref,
    });
    const evt = {
      payment_link: 'payment_link.paid',
      invoice: 'invoice.paid',
      escrow: 'escrow.funded',
    }[kind];
    this.webhooks.emit(businessId, 'sandbox', evt, {
      id,
      amount,
      transaction_reference: ref,
    });
    return { livemode: false, notice: SANDBOX_NOTICE, data: view(payment) };
  }
}
