import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsPositive } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { verifyDeviceToken } from '../common/utils/device-token.util';
import { JwtGuard } from '../common/guards/jwt.guard';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

class DepositDto {
  @IsNumber() @IsPositive() amount_fiat!: number;
  @IsNotEmpty() @IsString() currency!: string;
}
class WithdrawDto {
  @IsNumber() @IsPositive() amount_farm!: number;
  @IsNotEmpty() @IsString() currency_fiat!: string;
  @IsNotEmpty() @IsString() method!: string;
  @IsNotEmpty() @IsString() destination!: string;
}

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post('deposit')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Initiate a fiat deposit via Paystack' })
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
  @UseGuards(JwtGuard)
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

  // Webhook endpoints — Public (no JWT) but guarded by HMAC signature verification
  @Public()
  @Post('webhooks/paystack')
  @UseGuards(WebhookSignatureGuard)
  @ApiOperation({ summary: 'Paystack webhook — HMAC-SHA512 verified' })
  paystackWebhook(@Req() req: Request) {
    // Use raw body to ensure the payload hasn't been re-serialised
    return this.svc.handlePaystackWebhook((req as any).rawBody
      ? JSON.parse((req as any).rawBody)
      : req.body);
  }

  @Public()
  @Post('webhooks/ivorypay')
  @UseGuards(WebhookSignatureGuard)
  @ApiOperation({ summary: 'Ivorypay webhook — HMAC-SHA256 verified' })
  ivorypayWebhook(@Req() req: Request) {
    return this.svc.handleIvorypayWebhook((req as any).rawBody
      ? JSON.parse((req as any).rawBody)
      : req.body);
  }
}