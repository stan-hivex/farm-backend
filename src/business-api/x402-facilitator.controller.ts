import type { FarmApiRequest } from '../common/types/auth-user';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
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
import { X402Service } from '../x402/x402.service';

/**
 * x402 facilitator for a business's OWN servers (POST /verify, /settle, GET /supported).
 * Live keys only, and payTo must be the business's FARM account, so FARM's fee
 * sponsorship can never be used to settle payments to third parties.
 */
@ApiTags('FARM API - x402 facilitator')
@ApiBearerAuth()
@UseGuards(BusinessApiKeyGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller({ path: 'farm/x402', version: '1' })
export class X402FacilitatorController {
  constructor(private readonly svc: X402Service) {}
  private async payTo(req: FarmApiRequest) {
    const a: FarmApiContext = req.farmApi;
    if (a.mode !== 'live') return null;
    return { a, payTo: await this.svc.payToFor(a.ownerUserId) };
  }
  @Get('supported')
  @RequireScope('x402:facilitate')
  supported() {
    return this.svc.supported();
  }
  @Post('verify')
  @HttpCode(200)
  @RequireScope('x402:facilitate')
  async verify(@Req() req: FarmApiRequest, @Body() b: any) {
    const ctx = await this.payTo(req);
    if (!ctx)
      return {
        isValid: false,
        invalidReason: 'invalid_network',
        invalidMessage: 'Use a live API key',
      };
    const { group, txId, sponsored, ...out } = await this.svc.verify(
      b?.paymentPayload,
      b?.paymentRequirements ?? {},
      ctx.payTo,
    );
    return out;
  }
  @Post('settle')
  @HttpCode(200)
  @RequireScope('x402:facilitate')
  async settle(@Req() req: FarmApiRequest, @Body() b: any) {
    const ctx = await this.payTo(req);
    if (!ctx)
      return {
        success: false,
        errorReason: 'invalid_network',
        transaction: '',
        network: '',
      };
    return this.svc.settle(
      b?.paymentPayload,
      b?.paymentRequirements ?? {},
      {
        source: 'facilitator',
        businessId: ctx.a.businessId,
        apiKeyId: ctx.a.keyId,
      },
      ctx.payTo,
    );
  }
}
