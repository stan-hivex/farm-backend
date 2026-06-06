import { Controller, Get, Post, Body, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { verifyDeviceToken } from '../common/utils/device-token.util';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
// Paystack webhook endpoint removed in favor of unified webhook queue flow

class DepositDto {
  @IsNumber() @IsPositive() amount_fiat!: number;
  @IsNotEmpty() @IsString() currency!: string;
  @IsOptional() @IsString() paymentMethod?: 'CARD' | 'MOBILE_MONEY' | 'CRYPTO';
  @IsOptional() @IsString() phone?: string;
}
class WithdrawDto {
  @IsNumber() @IsPositive() amount_farm!: number;
  @IsNotEmpty() @IsString() currency_fiat!: string;
  @IsNotEmpty() @IsString() method!: string;
  @IsNotEmpty() @IsString() destination!: string;
  @IsOptional() @IsString() wallet_address?: string; // Crypto wallet address for CRYPTO method
  @IsOptional() @IsString() network?: string; // Blockchain network (e.g., ETH, BTC, SOL) for CRYPTO method
}

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  // Paystack-specific HTTP webhook endpoint removed.
  // Use the unified `/webhooks/paystack` endpoint handled by `WebhookController` and queued processing.

  @Post('deposit')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Initiate a fiat deposit (CARD, MOBILE_MONEY, CRYPTO)' })
  deposit(@CurrentUser() u: any, @Body() dto: DepositDto, @Req() req: Request) {
    // Prefer a signed device token to prevent spoofing
    let deviceRisk = 0;
    const token = (req.headers['x-device-token'] as string) || '';
    if (token) {
      const p = verifyDeviceToken(token) as any;
      if (p && typeof p.deviceRisk !== 'undefined') deviceRisk = Number(p.deviceRisk) || 0;
    } else {
      const header = req.headers['x-device-risk'] || req.headers['x-device-risk-score'];
      deviceRisk = header ? Number(header as string) || 0 : 0;
    }
    return this.svc.initiateDeposit(u.id, dto, { deviceRisk, ip: req.ip || '' });
  }

  @Post('withdraw')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Request a withdrawal' })
  withdraw(@CurrentUser() u: any, @Body() dto: WithdrawDto, @Req() req: Request) {
    let deviceRisk = 0;
    const token = (req.headers['x-device-token'] as string) || '';
    if (token) {
      const p = verifyDeviceToken(token) as any;
      if (p && typeof p.deviceRisk !== 'undefined') deviceRisk = Number(p.deviceRisk) || 0;
    } else {
      const header = req.headers['x-device-risk'] || req.headers['x-device-risk-score'];
      deviceRisk = header ? Number(header as string) || 0 : 0;
    }
    return this.svc.requestWithdrawal(u.id, dto, { deviceRisk, ip: req.ip || '' });
  }

  @Get('deposits')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get deposit history' })
  deposits(@CurrentUser() u: any) {
    return this.svc.getDepositHistory(u.id);
  }

  @Get('withdrawals')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get withdrawal history' })
  withdrawals(@CurrentUser() u: any) {
    return this.svc.getWithdrawalHistory(u.id);
  }

  // Note: Webhook HTTP endpoints live under src/webhook/webhook.controller.ts
}