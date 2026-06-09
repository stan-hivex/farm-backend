// src/deposit/deposit.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private ivorypay: IvorypayService,
  ) {}

  async createDeposit(userId: string, dto: any) {
    const amount = Number(dto.amount_fiat);
    if (amount < 10) throw new BadRequestException('Minimum deposit is KES 10');

    const reference = uuidv4();
    const paymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
    const feeRate = paymentMethod === 'MOBILE_MONEY' ? 0.015 : 0.02;
    const fee = amount * feeRate;
    const total = amount + fee;

    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount,
        fee,
        total,
        currency: dto.currency || 'KES',
        paymentMethod,
        reference,
        status: 'PENDING',
        providerRef: reference,
      },
    });

    let paymentUrl: string | null = null;

    if (paymentMethod === 'CRYPTO') {
      const init = await this.ivorypay.createPayment({
        amount: total,
        currency: 'KES',
        reference,
        email: dto.email || `${userId}@farm.app`,
        description: `Farm deposit ${total} KES via crypto`,
      });
      paymentUrl = init.data?.payment_link || init.payment_link || init.checkout_url;
    } else if (paymentMethod === 'MOBILE_MONEY') {
      if (!dto.phone) {
        throw new BadRequestException('Phone number is required for mobile money deposits');
      }

      const init = await this.paystack.initializePayment({
        email: dto.email || `${userId}@farm.app`,
        amount: total,
        reference,
        currency: 'KES',
        channels: ['mobile_money'],
        phone: dto.phone,
        metadata: { userId, depositId: deposit.id, paymentMethod },
      });
      paymentUrl = init.authorization_url || init.authorizationUrl;
    } else if (paymentMethod === 'CARD') {
      // Card deposits should not use mobile-money Paystack flow; leave card handling
      // to the client or a separate card-specific integration.
      paymentUrl = null;
    } else {
      throw new BadRequestException(`Unsupported payment method ${paymentMethod}`);
    }

    return {
      success: true,
      payment_url: paymentUrl,
      reference,
      deposit,
    };
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
    return { balance: wallet?.balance ?? 0, locked_balance: wallet?.locked_balance ?? 0 };
  }

  async getDepositById(id: string) {
    return this.prisma.deposit.findUnique({ where: { id } });
  }

  // Called ONLY from webhook
  async finalizeSuccessfulDeposit(reference: string) {
    // Implementation already solid in your WebhookService.finalizeDeposit
    // Just ensure it's called
  }
}