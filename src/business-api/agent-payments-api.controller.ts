import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  BusinessApiKeyGuard,
  FarmApiContext,
  RequireScope,
} from './api-key-auth.guard';
import {
  AgentPaymentsService,
  BizCtx,
} from '../agent-payments/agent-payments.service';
import {
  AgentRequestBody,
  IntentBody,
  RefundBody,
} from '../agent-payments/agent-payments.controller';

/** Phase 9 developer API: payment intents, refunds, agent payment requests. */
@ApiTags('FARM API - Agent payments')
@ApiBearerAuth()
@UseGuards(BusinessApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller({ path: 'farm', version: '1' })
export class AgentPaymentsApiController {
  constructor(private readonly svc: AgentPaymentsService) {}
  private ctx(req: any): BizCtx {
    const a: FarmApiContext = req.farmApi;
    return {
      businessId: a.businessId,
      ownerUserId: a.ownerUserId,
      actorUserId: null,
      live: a.mode === 'live',
    };
  }
  private wrap = async (live: boolean, p: Promise<any>) => ({
    livemode: live,
    ...(await p),
  });

  @Get('payment-intents')
  @RequireScope('payment_intents:read')
  async list(@Req() req: any, @Query('status') status?: string) {
    const c = this.ctx(req);
    return {
      livemode: c.live,
      data: await this.svc.listIntents(c.businessId, c.live, status),
    };
  }
  @Post('payment-intents')
  @RequireScope('payment_intents:write')
  create(
    @Req() req: any,
    @Body() b: IntentBody,
    @Headers('idempotency-key') idem?: string,
  ) {
    const c = this.ctx(req);
    return this.wrap(
      c.live,
      this.svc.createIntent(c, b, idem ?? b.idempotency_key),
    );
  }
  @Get('payment-intents/:id')
  @RequireScope('payment_intents:read')
  get(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.ctx(req);
    return this.wrap(c.live, this.svc.getIntent(c.businessId, id, c.live));
  }
  @Post('payment-intents/:id/cancel')
  @HttpCode(200)
  @RequireScope('payment_intents:write')
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.ctx(req);
    return this.wrap(c.live, this.svc.cancelIntent(c.businessId, id, c.live));
  }
  @Post('payment-intents/:id/simulate-payment')
  @HttpCode(200)
  @RequireScope('payment_intents:write')
  simulate(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.ctx(req);
    return this.wrap(false, this.svc.simulateIntent(c.businessId, id));
  }
  @Get('payment-intents/:id/refunds')
  @RequireScope('payment_intents:read')
  async refunds(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.ctx(req);
    return {
      livemode: c.live,
      data: await this.svc.listRefunds(c.businessId, id, c.live),
    };
  }
  @Post('payment-intents/:id/refunds')
  @RequireScope('refunds:write')
  refund(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: RefundBody,
    @Headers('idempotency-key') idem?: string,
  ) {
    const c = this.ctx(req);
    return this.wrap(
      c.live,
      this.svc.refund(c, id, b, idem ?? b.idempotency_key),
    );
  }
  @Get('agent-authorizations')
  @RequireScope('agent_payments:read')
  async mandates(@Req() req: any) {
    const c = this.ctx(req);
    return {
      livemode: c.live,
      data: c.live ? await this.svc.businessMandates(c.businessId) : [],
    };
  }
  @Post('agent-payment-requests')
  @RequireScope('agent_payments:write')
  request(
    @Req() req: any,
    @Body() b: AgentRequestBody,
    @Headers('idempotency-key') idem?: string,
  ) {
    const c = this.ctx(req);
    return this.wrap(
      c.live,
      this.svc.createAgentRequest(c, b, idem ?? b.idempotency_key),
    );
  }
  @Get('agent-payment-requests/:id')
  @RequireScope('agent_payments:read')
  getRequest(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.ctx(req);
    return this.wrap(c.live, this.svc.businessGetRequest(c.businessId, id));
  }
}
