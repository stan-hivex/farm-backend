import { forwardRef, Inject, Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { PaystackService } from '../paystack/paystack.service';
@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => IvorypayService))
    private ivorypay: IvorypayService,
    @Inject(forwardRef(() => PaystackService))
    private paystack: PaystackService,
    private websocket: WebsocketGateway,
    private readonly cfg: ConfigService,
  ) {}

  private validatePaymentMethod(method: string) {
    const allowed = ['CRYPTO', 'CARD', 'MOBILE_MONEY'];
    if (!allowed.includes(method)) {
      throw new BadRequestException('Unsupported payment method');
    }
  }

  async createDeposit(userId: string, dto: any) {
    this.validatePaymentMethod(dto.paymentMethod);
    const fee = dto.amount * 0.02;
    const total = dto.amount + fee;

    if (this.isPotentialFraud(dto)) {
      throw new BadRequestException('Deposit flagged for review due to anti-fraud checks');
    }

    const reference = uuidv4();

    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount: dto.amount,
        fee,
        total,
        currency: dto.currency || 'KES',
        paymentMethod: dto.paymentMethod,
        reference,
        status: 'PENDING',
      },
    });

    this.logger.log(`createDeposit: created deposit id=${deposit.id} reference=${reference} user=${userId} amount=${dto.amount}`);

    const method = dto.paymentMethod;

switch (method) {
  case 'CRYPTO': {
    const payment = await this.ivorypay.createPayment({
      amount: total,
      currency: 'KES',
      reference,
      email: dto.email || 'customer@example.com',
    });

    return {
      success: true,
      provider: 'IVORYPAY',
      deposit,
      paymentLink: payment.payment_link,
    };
  }

  case 'CARD': {
    const payment = await this.paystack.initializePayment({
      email: dto.email || 'customer@email.com',
      amount: total,
      currency: dto.currency,
      reference,
    });

    return {
      success: true,
      provider: 'PAYSTACK',
      deposit,
      authorization_url: payment.authorization_url,
    };
  }

  case 'MOBILE_MONEY': {
    const phone = dto.phone;
    if (!phone) {
      throw new BadRequestException('Phone number is required for mobile money deposits');
    }
    const payment = await this.paystack.initializePayment({
      email: dto.email || 'customer@example.com',
      amount: total,
      currency: dto.currency,
      reference,
      payment_method: 'MOBILE_MONEY',
      phone,
    });

    return {
      success: true,
      provider: 'PAYSTACK',
      deposit,
      authorization_url: payment.authorization_url,
    };
  }

  default:
    throw new BadRequestException('Invalid payment method');
}

    return {
      success: true,
      deposit,
    };
  }

  private isPotentialFraud(dto: any) {
    const amount = Number(dto.amount ?? 0);
    const maxAllowed = Number(this.cfg.get<number>('FRAUD_MAX_DEPOSIT_AMOUNT', 1000000));
    if (amount > maxAllowed) {
      return true;
    }

    if (dto.paymentMethod === 'CRYPTO' && dto.amount > (this.cfg.get<number>('FRAUD_CRYPTO_THRESHOLD', 250000))) {
      return true;
    }

    return false;
  }

  async getUserDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWalletBalance(userId: string) {
    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });

    return {
      balance: Number(wallet?.balance ?? 0),
      currency: wallet?.currency ?? 'KES',
    };
  }

  /**
   * DEPRECATED: Wallet credit must ONLY happen in WebhookService.finalizeDeposit().
   * This method is kept for reference but should never be called.
   *
   * Use WebhookService.finalizeDeposit() which includes all necessary security validations:
   * - HMAC-SHA512 signature verification
   * - Amount validation (kobo vs fiat conversion)
   * - Fraud detection and anti-fraud checks
   * - Proper state machine transitions (pending → completed)
   * - Idempotent processing (using Redis locks)
   *
   * @deprecated Use WebhookService.finalizeDeposit() instead
   * @throws Error Always returns false to prevent accidental wallet credit
   */
  async markDepositSuccessful(reference: string): Promise<boolean> {
    this.logger.warn(
      `markDepositSuccessful called for ${reference} — this method is DEPRECATED. ` +
      'Use WebhookService.finalizeDeposit() for all wallet credit operations.',
    );
    return false;
  }

  async getDepositById(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
    });

    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }

    return deposit;
  }
}