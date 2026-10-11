import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { QrService } from './qr.service';
import { Throttle } from '@nestjs/throttler';
import { DepositService } from '../deposit/deposit.service';

class MerchantCheckoutPaymentDto {
  @IsString()
  @Length(1, 4096)
  qr_payload!: string;

  @IsNumber()
  @IsPositive()
  @Min(10)
  amount_kes!: number;

  @IsIn(['CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CRYPTO'])
  payment_method!: 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CRYPTO';

  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(['USDC', 'USDT'])
  crypto?: string;

  @IsOptional()
  @IsIn(['BSC', 'POLYGON', 'SOL', 'BASE', 'STARKNET', 'ALGORAND'])
  chain?: string;
}

@ApiTags('QR Merchant Checkout')
@Controller({ path: 'qr/checkout', version: '1' })
export class MerchantCheckoutController {
  private readonly logger = new Logger(MerchantCheckoutController.name);

  constructor(
    private readonly qrService: QrService,
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly depositService: DepositService,
  ) {}

  @Public()
  @Get('merchant')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get public details for a signed merchant QR' })
  async getMerchant(@Query('qr_payload') qrPayload: string) {
    if (!qrPayload) throw new BadRequestException('Merchant QR payload is required');
    const validation = (await this.qrService.validate(qrPayload, '')).data;
    if (validation.type !== 'merchant') {
      throw new BadRequestException('This QR code is not a merchant payment QR');
    }

    return {
      data: {
        merchant_id: validation.merchant_id,
        business_name: validation.business_name,
        currency: 'KES',
        fiat_methods: ['CARD', 'MOBILE_MONEY', 'BANK_TRANSFER'],
        crypto_tokens: ['USDC', 'USDT'],
        crypto_networks: ['BSC', 'POLYGON', 'SOL', 'BASE', 'STARKNET', 'ALGORAND'],
      },
    };
  }

  @Public()
  @Get('payment-status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check the verified status of a merchant QR payment' })
  async getPaymentStatus(@Query('reference') reference: string) {
    if (!reference || reference.length > 128) {
      throw new BadRequestException('A valid payment reference is required');
    }

    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        metadata: true,
      },
    });
    const metadata =
      (transaction?.metadata as Record<string, unknown> | null) ?? {};
    if (!transaction || metadata.qr_guest_payment !== true) {
      throw new BadRequestException('Merchant QR payment was not found');
    }

    if (transaction.status?.toLowerCase() === 'completed') {
      try {
        await this.depositService.finalizeMerchantQrPayment(reference);
      } catch (error) {
        this.logger.error(
          `Could not finalize merchant QR record for ${reference}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const qrPayment = await this.prisma.qr_payments.findFirst({
      where: { transaction_id: transaction.id },
      select: { merchant_id: true, status: true },
    });
    if (!qrPayment) {
      throw new BadRequestException('Merchant QR payment record was not found');
    }
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: qrPayment.merchant_id! },
      select: { business_name: true },
    });
    const status = transaction.status?.toLowerCase();

    return {
      data: {
        status:
          status === 'completed'
            ? 'completed'
            : ['failed', 'cancelled', 'reversed', 'expired', 'abandoned'].includes(
                  status ?? '',
                )
              ? 'failed'
              : 'pending',
        business_name: merchant?.business_name ?? 'Merchant',
        amount: Number(transaction.amount ?? 0),
        currency: transaction.currency ?? 'FARM',
      },
    };
  }

  @Public()
  @Post('payment')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start a public fiat or crypto merchant QR payment' })
  async createPayment(@Body() dto: MerchantCheckoutPaymentDto, @Ip() ip: string) {
    const validation = (await this.qrService.validate(dto.qr_payload, '')).data;
    if (validation.type !== 'merchant') {
      throw new BadRequestException('This QR code is not a merchant payment QR');
    }

    const merchant = await this.prisma.merchants.findUnique({
      where: { id: validation.merchant_id },
      select: { id: true, user_id: true, business_name: true, status: true },
    });
    if (!merchant?.user_id || merchant.status !== 'approved') {
      throw new BadRequestException('This merchant cannot currently accept payments');
    }

    const initiation = await this.paymentsService.initiateDeposit(
      merchant.user_id,
      {
        amount_fiat: dto.amount_kes,
        currency: 'KES',
        paymentMethod: dto.payment_method,
        phone: dto.phone,
        email: dto.email,
        crypto: dto.crypto,
        chain: dto.chain,
        callbackUrl: this.config.get(
          'PUBLIC_MERCHANT_CHECKOUT_URL',
          'https://farmapp.africa/merchant-payment/',
        ),
      },
      { ip },
    );

    const paymentData = initiation.data as Record<string, unknown>;
    const reference = String(paymentData.reference ?? '');
    const paymentUrl =
      paymentData.payment_url ??
      paymentData.authorization_url ??
      paymentData.payment_link ??
      paymentData.checkout_url;
    if (!reference || typeof paymentUrl !== 'string' || !paymentUrl) {
      throw new BadRequestException('The payment provider did not return a checkout URL');
    }

    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
      select: { id: true, metadata: true, amount: true },
    });
    if (!transaction) {
      throw new BadRequestException('Could not link the initiated payment to this merchant');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transactions.update({
        where: { id: transaction.id },
        data: {
          metadata: {
            ...((transaction.metadata as Record<string, unknown> | null) ?? {}),
            merchant_id: merchant.id,
            qr_guest_payment: true,
            qr_payload: dto.qr_payload,
            qr_amount_kes: dto.amount_kes,
            qr_payment_method: dto.payment_method,
            customer_name: 'Guest customer',
          },
        },
      });
      await tx.qr_payments.create({
        data: {
          merchant_id: merchant.id,
          transaction_id: transaction.id,
          qr_payload: dto.qr_payload,
          amount: transaction.amount,
          status: 'pending',
          scanned_at: new Date(),
        },
      });
    });

    return {
      data: {
        reference,
        payment_url: paymentUrl,
        business_name: merchant.business_name,
      },
      message: 'Payment initiated. The merchant wallet will be credited after provider confirmation.',
    };
  }
}
