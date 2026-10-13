import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CreateQrPaymentDto } from './create-qr-payment.dto';
import { QrPaymentsService } from './qr-payments.service';

@ApiTags('QR Payments')
@Controller({ version: '1' })
export class QrPaymentsController {
  constructor(private readonly qrPayments: QrPaymentsService) {}

  @Public()
  @Post('qr-payments/initialize')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Initialize a public merchant QR payment' })
  initialize(@Body() dto: CreateQrPaymentDto) {
    return this.qrPayments.initialize(dto);
  }

  @Public()
  @Get('qr-payments/crypto-options')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get active crypto options for public QR checkout' })
  cryptoOptions() {
    return this.qrPayments.getPublicCryptoOptions();
  }

  @Public()
  @Get('qr-payments/verify/:reference')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify a public merchant QR payment' })
  verify(@Param('reference') reference: string) {
    if (!reference || reference.length > 128) {
      throw new BadRequestException('A valid payment reference is required');
    }
    return this.qrPayments.verify(reference);
  }
}
