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
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BusinessAccessService } from '../business-ops/business-access.service';
import { AgentPaymentsService } from './agent-payments.service';

export class PinDto {
  @IsString() @Length(4, 6) pin!: string;
}
export class MandateBody {
  @IsUUID() business_id!: string;
  @IsNumber() @Min(1) per_tx_cap!: number;
  @IsNumber() @Min(1) daily_cap!: number;
  @IsNumber() @Min(1) monthly_cap!: number;
  @IsInt() @Min(1) @Max(365) expires_in_days!: number;
  @IsOptional() @IsString() @Length(1, 100) label?: string;
  @IsString() @Length(4, 6) pin!: string;
}
export class IntentBody {
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() @Length(1, 255) description?: string;
  @IsOptional() @IsString() @Length(1, 100) reference?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(5) @Max(10080) expires_in_minutes?: number;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotency_key?: string;
}
export class RefundBody {
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() @Length(1, 255) reason?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotency_key?: string;
}
export class DashboardRefundBody extends RefundBody {
  @IsString() @Length(4, 6) pin!: string;
}
export class AgentRequestBody {
  @IsUUID() authorization_id!: string;
  @IsUUID() payment_intent_id!: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/)
  idempotency_key?: string;
}

/** Payer side: pay intents, manage agent mandates, approve agent requests. */
@ApiTags('Agent payments')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'agent-payments', version: '1' })
export class AgentPaymentsController {
  constructor(private readonly svc: AgentPaymentsService) {}

  @Get('status') status() {
    return this.svc.status();
  }

  @Get('intents/:id') intent(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.publicIntent(id);
  }

  @Post('intents/:id/pay')
  @HttpCode(200)
  @UseGuards(KycGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pay(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PinDto,
    @Req() req: Request,
  ) {
    return this.svc.payIntent(u.id, id, b.pin, req.ip ?? '');
  }

  @Get('authorizations') async mandates(@CurrentUser() u: any) {
    return { data: await this.svc.myMandates(u.id) };
  }

  @Post('authorizations')
  @UseGuards(KycGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createMandate(@CurrentUser() u: any, @Body() b: MandateBody) {
    return this.svc.createMandate(u.id, b);
  }

  @Post('authorizations/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revokeMandate(u.id, id);
  }

  @Get('requests') async requests(
    @CurrentUser() u: any,
    @Query('status') status?: string,
  ) {
    return { data: await this.svc.myRequests(u.id, status) };
  }

  @Post('requests/:id/confirm')
  @HttpCode(200)
  @UseGuards(KycGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PinDto,
    @Req() req: Request,
  ) {
    return this.svc.confirmRequest(u.id, id, b.pin, req.ip ?? '');
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rejectRequest(u.id, id);
  }
}

/** Business dashboard: create intents, refund, see mandates. */
@ApiTags('Business - Payment intents')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'business', version: '1' })
export class BusinessIntentsController {
  constructor(
    private readonly svc: AgentPaymentsService,
    private readonly access: BusinessAccessService,
  ) {}

  private async ctx(userId: string, perm: 'links:read' | 'links:manage') {
    const a = await this.access.resolve(userId, perm);
    return {
      businessId: a.business.id,
      ownerUserId: a.business.owner_user_id,
      actorUserId: userId,
      live: true,
    };
  }

  @Get('payment-intents') async list(
    @CurrentUser() u: any,
    @Query('status') status?: string,
  ) {
    const c = await this.ctx(u.id, 'links:read');
    return { data: await this.svc.listIntents(c.businessId, true, status) };
  }
  @Post('payment-intents') async create(
    @CurrentUser() u: any,
    @Body() b: IntentBody,
    @Headers('idempotency-key') idem?: string,
  ) {
    return this.svc.createIntent(
      await this.ctx(u.id, 'links:manage'),
      b,
      idem ?? b.idempotency_key,
    );
  }
  @Get('payment-intents/:id') async get(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getIntent(
      (await this.ctx(u.id, 'links:read')).businessId,
      id,
      true,
    );
  }
  @Post('payment-intents/:id/cancel') @HttpCode(200) async cancel(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.cancelIntent(
      (await this.ctx(u.id, 'links:manage')).businessId,
      id,
      true,
    );
  }
  @Get('payment-intents/:id/refunds') async refunds(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.svc.listRefunds(
        (await this.ctx(u.id, 'links:read')).businessId,
        id,
        true,
      ),
    };
  }
  @Post('payment-intents/:id/refunds')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refund(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DashboardRefundBody,
    @Headers('idempotency-key') idem?: string,
  ) {
    return this.svc.refundFromDashboard(u.id, id, b, idem ?? b.idempotency_key);
  }
  @Get('agent-authorizations') async mandates(@CurrentUser() u: any) {
    return {
      data: await this.svc.businessMandates(
        (await this.ctx(u.id, 'links:read')).businessId,
      ),
    };
  }
}
