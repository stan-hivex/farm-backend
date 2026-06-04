import { forwardRef, Inject, Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { PaystackService } from '../paystack/paystack.service';
import { StkPushService } from '../stk/stk.service';
@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => IvorypayService))
    private ivorypay: IvorypayService,
    @Inject(forwardRef(() => PaystackService))
    private paystack: PaystackService,
    private readonly stkPush: StkPushService,
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
    const phone = dto.phone || dto.msisdn || dto.mobile;
    if (!phone) {
      throw new BadRequestException('Phone number is required for mobile money deposits');
    }

    const stkResponse = await this.stkPush.initiatePush({
      phone,
      amount: total,
      reference,
      accountReference: reference,
      description: `Deposit via mobile money (${dto.currency} ${dto.amount})`,
    });

    return {
      success: true,
      provider: 'STK_PUSH',
      deposit,
      stk_response: stkResponse,
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

  async markDepositSuccessful(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { reference },
    });

    this.logger.log(`markDepositSuccessful: lookup deposit reference=${reference} found=${!!deposit}`);

    if (!deposit || deposit.status !== 'PENDING') {
      return false;
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: deposit.userId, is_active: true },
    });

    const depositWallet =
      wallet ||
      (await this.prisma.wallets.create({
        data: {
          user_id: deposit.userId,
          wallet_name: 'Main Wallet',
          wallet_type: 'user',
          wallet_address: uuidv4(),
          currency: deposit.currency || 'KES',
        },
      }));

    const previousBalance = Number(depositWallet.balance ?? 0);
    const updatedBalance = previousBalance + deposit.amount;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedDeposits = await tx.deposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'SUCCESS' },
      });
      if (updatedDeposits.count === 0) {
        return false;
      }

      await tx.wallets.update({
        where: { id: depositWallet.id },
        data: { balance: { increment: deposit.amount } },
      });

      await tx.ledger_entries.create({
        data: {
          wallet_id: depositWallet.id,
          entry_type: 'credit',
          amount: deposit.amount,
          balance_before: previousBalance,
          balance_after: updatedBalance,
          description: `Deposit completed — ref: ${reference}`,
        },
      });
      return true;
    });

    if (!result) {
      return false;
    }

    this.logger.log(`markDepositSuccessful: deposit ${deposit.id} marked SUCCESS, emitting balance ${updatedBalance} for user ${deposit.userId}`);
    this.websocket.emitBalanceUpdate(deposit.userId, updatedBalance);
    this.websocket.emitTransactionUpdate(deposit.userId, {
      reference,
      status: 'SUCCESS',
    });

    return true;
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