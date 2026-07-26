import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { IvorypayDepositService } from './ivorypay-deposit.service';

@Controller({ path: 'crypto', version: '1' })
export class CryptoController {
  constructor(private readonly ivorypayDepositService: IvorypayDepositService) {}

  @UseGuards(JwtAuthGuard)
  @Permissions('payments:write')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('deposit')
  async deposit(@Req() req: any, @Body() dto: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User ID not found in request');
    }
    return this.ivorypayDepositService.createDeposit(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Permissions('payments:read')
  @Get('status/:reference')
  async status(@Param('reference') reference: string) {
    return this.ivorypayDepositService.getStatus(reference);
  }

  @UseGuards(WebhookSignatureGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('webhook')
  async webhook(@Body() body: any) {
    return this.ivorypayDepositService.handleWebhook(body, true);
  }
}
