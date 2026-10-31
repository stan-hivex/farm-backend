import type { FarmApiRequest } from '../common/types/auth-user';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { paginate, paginationParams } from '../common/utils/pagination.util';
import { BusinessFinanceService } from '../business-ops/business-finance.service';
import { BusinessCommerceService } from '../business-ops/business-commerce.service';
import { BusinessEscrowService } from '../business-ops/business-escrow.service';
import { WEBHOOK_EVENTS } from '../business-ops/business-webhooks.service';
import {
  BusinessEscrowDto,
  InvoiceDto,
  PaymentLinkDto,
} from '../business-ops/business-ops.dto';
import {
  BusinessApiKeyGuard,
  FarmApiContext,
  RequireScope,
} from './api-key-auth.guard';
import { ApiPayoutDto } from './business-api.dto';
import { SandboxService } from './sandbox.service';
import { BusinessProjectsService } from '../project-marketplace/business-projects.service';
import { ApiPayoutsService } from './api-payouts.service';

const live = async (p: Promise<any>) => ({ livemode: true, ...(await p) });

/**
 * The unified FARM developer API. Authenticate with
 * `Authorization: Bearer farm_sk_test_…` (sandbox) or `farm_sk_live_…` (live).
 */
@ApiTags('FARM API')
@ApiBearerAuth()
@UseGuards(BusinessApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller({ path: 'farm', version: '1' })
export class PublicApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: BusinessFinanceService,
    private readonly commerce: BusinessCommerceService,
    private readonly escrow: BusinessEscrowService,
    private readonly sandbox: SandboxService,
    private readonly apiPayouts: ApiPayoutsService,
    private readonly projectsSvc: BusinessProjectsService,
  ) {}

  private api(req: FarmApiRequest): FarmApiContext {
    return req.farmApi;
  }

  // ---------- account ----------
  @Get('account')
  @RequireScope('account:read')
  @ApiOperation({ summary: 'Business account and wallet balance' })
  async account(@Req() req: FarmApiRequest) {
    const a = this.api(req);
    if (a.mode === 'sandbox') return this.sandbox.account(a.businessId);
    const b = await this.prisma.businesses.findUnique({
      where: { id: a.businessId },
      select: { id: true, legal_name: true, trading_name: true, status: true },
    });
    const w = await this.finance.wallet(a.ownerUserId);
    return { livemode: true, data: { ...b, wallet: w.data } };
  }

  // ---------- transactions & payments ----------
  @Get('transactions')
  @RequireScope('transactions:read')
  transactions(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.list(a.businessId, 'payment', q)
      : live(this.finance.transactions(a.ownerUserId, q));
  }

  @Get('transactions/:id')
  @RequireScope('transactions:read')
  transaction(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.getView(a.businessId, 'payment', id)
      : live(this.finance.transaction(a.ownerUserId, id));
  }

  @Get('payments')
  @RequireScope('payments:read')
  async payments(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    if (a.mode === 'sandbox')
      return this.sandbox.list(a.businessId, 'payment', q);
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = { business_id: a.businessId };
    if (q.source) where.source = String(q.source);
    const [items, total] = await Promise.all([
      this.prisma.business_payments.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.business_payments.count({ where }),
    ]);
    return {
      livemode: true,
      data: items.map((p) => ({ ...p, amount: Number(p.amount) })),
      meta: paginate(total, page, limit),
    };
  }

  // ---------- payment links ----------
  @Get('payment-links')
  @RequireScope('payment_links:read')
  links(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.list(a.businessId, 'payment_link', q)
      : live(this.commerce.listLinks(a.ownerUserId, q));
  }

  @Get('payment-links/:id')
  @RequireScope('payment_links:read')
  link(@Req() req: FarmApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.getView(a.businessId, 'payment_link', id)
      : live(this.commerce.getLink(a.ownerUserId, id));
  }

  @Post('payment-links')
  @RequireScope('payment_links:write')
  createLink(@Req() req: FarmApiRequest, @Body() dto: PaymentLinkDto) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.create(a.businessId, 'payment_link', dto, 'active')
      : live(this.commerce.createLink(a.ownerUserId, dto));
  }

  @Post('payment-links/:id/deactivate')
  @HttpCode(200)
  @RequireScope('payment_links:write')
  deactivateLink(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.setStatus(
          a.businessId,
          'payment_link',
          id,
          ['active'],
          'inactive',
        )
      : live(this.commerce.setLinkActive(a.ownerUserId, id, false));
  }

  // ---------- invoices ----------
  @Get('invoices')
  @RequireScope('invoices:read')
  invoices(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.list(a.businessId, 'invoice', q)
      : live(this.commerce.listInvoices(a.ownerUserId, q));
  }

  @Get('invoices/:id')
  @RequireScope('invoices:read')
  invoice(@Req() req: FarmApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.getView(a.businessId, 'invoice', id)
      : live(this.commerce.getInvoice(a.ownerUserId, id));
  }

  @Post('invoices')
  @RequireScope('invoices:write')
  createInvoice(@Req() req: FarmApiRequest, @Body() dto: InvoiceDto) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.create(a.businessId, 'invoice', dto, 'draft')
      : live(this.commerce.createInvoice(a.ownerUserId, dto));
  }

  @Post('invoices/:id/send')
  @HttpCode(200)
  @RequireScope('invoices:write')
  sendInvoice(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.setStatus(a.businessId, 'invoice', id, ['draft'], 'sent')
      : live(this.commerce.sendInvoice(a.ownerUserId, id));
  }

  @Post('invoices/:id/cancel')
  @HttpCode(200)
  @RequireScope('invoices:write')
  cancelInvoice(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.setStatus(
          a.businessId,
          'invoice',
          id,
          ['draft', 'sent', 'pending', 'overdue'],
          'cancelled',
        )
      : live(this.commerce.cancelInvoice(a.ownerUserId, id));
  }

  // ---------- escrow ----------
  @Get('escrows')
  @RequireScope('escrow:read')
  escrows(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.list(a.businessId, 'escrow', q)
      : live(this.escrow.list(a.ownerUserId, q));
  }

  @Get('escrows/:id')
  @RequireScope('escrow:read')
  escrowOne(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.getView(a.businessId, 'escrow', id)
      : live(this.escrow.get(a.ownerUserId, id));
  }

  @Post('escrows')
  @RequireScope('escrow:write')
  createEscrow(@Req() req: FarmApiRequest, @Body() dto: BusinessEscrowDto) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.create(a.businessId, 'escrow', dto, 'created')
      : live(this.escrow.create(a.ownerUserId, dto));
  }

  @Post('escrows/:id/send')
  @HttpCode(200)
  @RequireScope('escrow:write')
  sendEscrow(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.setStatus(
          a.businessId,
          'escrow',
          id,
          ['created'],
          'awaiting_payment',
        )
      : live(this.escrow.send(a.ownerUserId, id));
  }

  @Post('escrows/:id/cancel')
  @HttpCode(200)
  @RequireScope('escrow:write')
  cancelEscrow(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.setStatus(
          a.businessId,
          'escrow',
          id,
          ['created', 'awaiting_payment'],
          'expired',
        )
      : live(this.escrow.cancel(a.ownerUserId, id));
  }

  // ---------- payouts ----------
  @Get('payouts')
  @RequireScope('payouts:read')
  payouts(@Req() req: FarmApiRequest, @Query() q: any) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.list(a.businessId, 'payout', q)
      : live(this.finance.payouts(a.ownerUserId, q));
  }

  @Post('payouts')
  @RequireScope('payouts:write')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Request a payout (live: processed automatically; send an Idempotency-Key header)',
  })
  requestPayout(
    @Req() req: FarmApiRequest,
    @Body() dto: ApiPayoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const a = this.api(req);
    return a.mode === 'sandbox'
      ? this.sandbox.create(a.businessId, 'payout', dto, 'pending')
      : live(this.apiPayouts.create(a, dto, idempotencyKey));
  }

  // ---------- projects (read-only; same data in sandbox and live) ----------
  @Get('projects')
  @RequireScope('projects:read')
  @ApiOperation({
    summary: 'Your investment projects and their funding status',
  })
  async projects(@Req() req: FarmApiRequest) {
    const a = this.api(req);
    return {
      livemode: a.mode === 'live',
      data: await this.projectsSvc.listForBusiness(a.businessId),
    };
  }

  @Get('projects/:id')
  @RequireScope('projects:read')
  async project(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const a = this.api(req);
    return {
      livemode: a.mode === 'live',
      data: await this.projectsSvc.getForBusiness(a.businessId, id),
    };
  }

  // ---------- webhooks ----------
  @Get('webhook-events')
  @ApiOperation({ summary: 'Event types you can subscribe to' })
  webhookEvents(@Req() req: FarmApiRequest) {
    return { livemode: this.api(req).mode === 'live', data: WEBHOOK_EVENTS };
  }

  // ---------- sandbox-only simulators ----------
  @Post('sandbox/payment-links/:id/simulate-payment')
  @HttpCode(200)
  @RequireScope('payment_links:write')
  simLink(@Req() req: FarmApiRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.simulate(req, 'payment_link', id);
  }

  @Post('sandbox/invoices/:id/simulate-payment')
  @HttpCode(200)
  @RequireScope('invoices:write')
  simInvoice(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.simulate(req, 'invoice', id);
  }

  @Post('sandbox/escrows/:id/simulate-payment')
  @HttpCode(200)
  @RequireScope('escrow:write')
  simEscrow(
    @Req() req: FarmApiRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.simulate(req, 'escrow', id);
  }

  private simulate(
    req: any,
    kind: 'payment_link' | 'invoice' | 'escrow',
    id: string,
  ) {
    const a = this.api(req);
    if (a.mode !== 'sandbox')
      throw new NotImplementedException(
        'Simulators only work with sandbox keys',
      );
    return this.sandbox.simulatePayment(a.businessId, kind, id);
  }
}
