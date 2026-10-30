import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
import { QrPaymentsService } from '../qr-payments/qr-payments.service';
import { BusinessCommerceService } from './business-commerce.service';
import { BusinessWebhooksService } from './business-webhooks.service';

const PAYABLE = ['sent', 'pending', 'overdue'];
export const WEB_METHODS = ['mpesa', 'card', 'bank', 'crypto'] as const;
export type WebMethod = (typeof WEB_METHODS)[number];

/**
 * Hosted web checkout for payers without the FARM app. The payer pays in KES
 * through the existing guest merchant checkout (QrPaymentsService), which
 * credits the business owner's wallet through the existing deposit pipeline.
 * This service only records and reconciles; it never moves wallet funds itself.
 */
@Injectable()
export class BusinessWebCheckoutService {
  private readonly logger = new Logger(BusinessWebCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: BusinessCommerceService,
    private readonly qr: QrPaymentsService,
    private readonly currency: CurrencyConversionService,
    private readonly webhooks: BusinessWebhooksService,
  ) {}

  /** Details for the public pay page. */
  async target(kind: 'link' | 'invoice', ref: string) {
    if (kind === 'link') {
      const l = await this.prisma.business_payment_links.findUnique({
        where: { code: ref },
      });
      if (!l) throw new NotFoundException('Payment link not found');
      const b = await this.commerce.businessName(l.business_id);
      return {
        kind,
        id: l.id,
        business_id: l.business_id,
        ref: l.code,
        title: l.title,
        description: l.description ?? '',
        amount: Number(l.amount),
        payable: this.commerce.linkState(l) === 'active',
        state: this.commerce.linkState(l),
        business_name: b.trading_name || b.legal_name,
      };
    }
    const inv = await this.prisma.business_invoices.findUnique({
      where: { invoice_number: ref },
    });
    if (!inv || inv.status === 'draft')
      throw new NotFoundException('Invoice not found');
    const b = await this.commerce.businessName(inv.business_id);
    return {
      kind,
      id: inv.id,
      business_id: inv.business_id,
      ref: inv.invoice_number,
      title: `Invoice ${inv.invoice_number}`,
      description: inv.due_date
        ? `Due ${inv.due_date.toISOString().slice(0, 10)}`
        : '',
      amount: Number(inv.total),
      payable: PAYABLE.includes(inv.status),
      state: inv.status,
      business_name: b.trading_name || b.legal_name,
    };
  }

  async quoteKes(amountFarm: number) {
    const rate = Number((await this.currency.getCurrentRate()).farm_kes_rate);
    if (!Number.isFinite(rate) || rate <= 0)
      throw new BadRequestException('The FARM exchange rate is unavailable');
    return Math.round(amountFarm * rate * 100) / 100;
  }

  /** Starts a provider checkout and returns the provider URL to redirect to. */
  async start(
    kind: 'link' | 'invoice',
    ref: string,
    method: string,
    email?: string,
  ) {
    if (!WEB_METHODS.includes(method as WebMethod))
      throw new BadRequestException('Choose a payment method');
    const t = await this.target(kind, ref);
    if (!t.payable)
      throw new GoneException(
        `This ${kind === 'link' ? 'link' : 'invoice'} cannot be paid (${t.state})`,
      );
    const biz = await this.prisma.businesses.findUnique({
      where: { id: t.business_id },
      select: { merchant_id: true },
    });
    if (!biz?.merchant_id)
      throw new BadRequestException(
        'This business cannot accept web payments yet. Pay in the FARM app.',
      );
    const amountKes = await this.quoteKes(t.amount);
    const res: any = await this.qr.initialize({
      merchantId: biz.merchant_id,
      amount: amountKes,
      method: method as WebMethod,
      guestEmail: email?.trim() || undefined,
    });
    const url: string | undefined =
      res?.data?.authorization_url ?? res?.authorization_url;
    const reference: string | undefined =
      res?.data?.reference ?? res?.reference;
    if (!url || !reference)
      throw new BadRequestException('Could not start the payment. Try again.');
    if (!/^https:\/\//i.test(url))
      throw new BadRequestException('Unexpected payment provider URL');
    await this.prisma.business_web_checkouts.create({
      data: {
        business_id: t.business_id,
        source: kind === 'link' ? 'payment_link' : 'invoice',
        source_id: t.id,
        transaction_reference: reference,
        amount: t.amount,
        amount_kes: amountKes,
        method,
        payer_email: email?.trim() || null,
      },
    });
    return { url, reference };
  }

  /**
   * Checks the provider status and, once completed, records the business
   * payment exactly once (status claim on the checkout row).
   */
  async reconcile(reference: string) {
    const c = await this.prisma.business_web_checkouts.findUnique({
      where: { transaction_reference: reference },
    });
    if (!c) throw new NotFoundException('Checkout not found');
    if (c.status !== 'pending') return c.status;
    let status: string;
    try {
      const v: any = await this.qr.verify(reference);
      status = v?.data?.status ?? 'pending';
    } catch (e) {
      this.logger.warn(`verify ${reference} failed: ${e}`);
      return 'pending';
    }
    if (status === 'failed') {
      await this.prisma.business_web_checkouts.updateMany({
        where: { id: c.id, status: 'pending' },
        data: { status: 'failed' },
      });
      return 'failed';
    }
    if (status !== 'completed') return 'pending';

    // Amount check: the credited FARM must match what was asked (1% rate tolerance).
    const txn = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      select: { amount: true, status: true },
    });
    const credited = Number(txn?.amount ?? 0);
    if (
      Math.abs(credited - Number(c.amount)) >
      Number(c.amount) * 0.01 + 0.01
    ) {
      this.logger.error(
        `Web checkout ${reference} amount mismatch: ${credited} vs ${String(c.amount)}`,
      );
    }
    const claim = await this.prisma.business_web_checkouts.updateMany({
      where: { id: c.id, status: 'pending' },
      data: { status: 'completed', completed_at: new Date() },
    });
    if (!claim.count) return 'completed';
    await this.prisma.business_payments.create({
      data: {
        business_id: c.business_id,
        source: c.source,
        source_id: c.source_id,
        payer_user_id: null,
        amount: credited || Number(c.amount),
        transaction_reference: reference,
        channel: 'web',
      },
    });
    if (c.source === 'payment_link') {
      await this.prisma.business_payment_links.update({
        where: { id: c.source_id },
        data: { use_count: { increment: 1 } },
      });
      this.webhooks.emit(c.business_id, 'live', 'payment_link.paid', {
        payment_link_id: c.source_id,
        amount: Number(c.amount),
        channel: 'web',
        transaction_reference: reference,
      });
    } else {
      const inv = await this.prisma.business_invoices.updateMany({
        where: { id: c.source_id, status: { in: PAYABLE as any } },
        data: {
          status: 'paid',
          paid_at: new Date(),
          transaction_reference: reference,
        },
      });
      if (!inv.count)
        this.logger.error(
          `Invoice ${c.source_id} was already settled; web payment ${reference} needs review`,
        );
      this.webhooks.emit(c.business_id, 'live', 'invoice.paid', {
        invoice_id: c.source_id,
        amount: Number(c.amount),
        channel: 'web',
        transaction_reference: reference,
      });
    }
    this.webhooks.emit(c.business_id, 'live', 'payment.succeeded', {
      source: c.source,
      source_id: c.source_id,
      amount: Number(c.amount),
      channel: 'web',
      transaction_reference: reference,
    });
    return 'completed';
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePending() {
    const since = new Date(Date.now() - 3 * 24 * 3600_000);
    const rows = await this.prisma.business_web_checkouts.findMany({
      where: { status: 'pending', created_at: { gte: since } },
      select: { transaction_reference: true },
      take: 100,
    });
    for (const r of rows) {
      try {
        await this.reconcile(r.transaction_reference);
      } catch (e) {
        this.logger.warn(`reconcile ${r.transaction_reference}: ${e}`);
      }
    }
  }
}
