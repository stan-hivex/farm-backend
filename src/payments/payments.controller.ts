import { Controller, Get, Post, Body, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { verifyDeviceToken } from '../common/utils/device-token.util';
import { JwtGuard } from '../common/guards/jwt.guard';
import { KycGuard } from '../common/guards/kyc.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
// Paystack webhook endpoint removed in favor of unified webhook queue flow

class DepositDto {
  @IsNumber() @IsPositive() amount_fiat!: number;
  @IsNotEmpty() @IsString() currency!: string;
  @IsOptional() @IsString() paymentMethod?: 'CARD' | 'MOBILE_MONEY' | 'CRYPTO' | 'BANK_TRANSFER';
  @IsOptional() @IsString() phone?: string;
}
// WithdrawDto removed: use WithdrawService endpoints instead

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  // Paystack-specific HTTP webhook endpoint removed.
  // Use the unified `/webhooks/paystack` endpoint handled by `WebhookController` and queued processing.

  @Permissions('payments:write')
  @Post('deposit')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard, KycGuard)
  @ApiOperation({ summary: 'Initiate a fiat deposit (CARD, MOBILE_MONEY, CRYPTO, BANK_TRANSFER)' })
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

  // Withdrawal endpoint removed: use POST /api/v1/withdraw/create (WithdrawService)
  // The old requestWithdrawal() method incorrectly debited wallets immediately.

  @Permissions('payments:read')
  @Get('deposits')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get deposit history' })
  deposits(@CurrentUser() u: any) {
    return this.svc.getDepositHistory(u.id);
  }

  @Permissions('payments:read')
  @Get('withdrawals')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get withdrawal history' })
  withdrawals(@CurrentUser() u: any) {
    return this.svc.getWithdrawalHistory(u.id);
  }

  // Note: Webhook HTTP endpoints live under src/webhook/webhook.controller.ts
}