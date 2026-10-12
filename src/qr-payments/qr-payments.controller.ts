import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
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
  private readonly logger = new Logger(QrPaymentsController.name);

  constructor(private readonly qrPayments: QrPaymentsService) {}

  @Public()
  @Get('merchants/public/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get public merchant details for QR checkout' })
  async getMerchant(@Param('id') merchantId: string) {
    if (
      merchantId === 'ANYID' ||
      merchantId.length < 10 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        merchantId,
      )
    ) {
      throw new BadRequestException('Invalid merchant ID from QR');
    }

    try {
      return await this.qrPayments.getPublicMerchant(merchantId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Public merchant lookup failed for ${merchantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  @Public()
  @Post('qr-payments/initialize')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Initialize a public merchant QR payment' })
  initialize(@Body() dto: CreateQrPaymentDto) {
    return this.qrPayments.initialize(dto);
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
