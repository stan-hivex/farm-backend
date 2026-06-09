// src/withdraw/withdraw.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaystackService } from '../paystack/paystack.service';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private paystack: PaystackService,
  ) {}

  async createWithdrawal(userId: string, dto: CreateWithdrawDto) {
    await this.authService.verifyPin(userId, dto.pin);

    const amount = Number(dto.amount);
    // ... validation (min/max, method, destination fields) same as before

    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
    // balance check...

    const feePercent = dto.method === 'MOBILE_MONEY' ? 0.02 : dto.method === 'CRYPTO' ? 0.005 : 0.015;
    const fee = amount * feePercent;
    const settlement = amount - fee;
    const reference = uuidv4();

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      // Lock funds
      await tx.wallets.update({
        where: { id: wallet!.id },
        data: { locked_balance: { increment: amount } },
      });

      const created = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          fee,
          settlement,
          total: amount,
          method: dto.method,
          reference,
          status: 'PENDING',
          // method-specific fields...
          phoneNumber: dto.phoneNumber,
          accountName: dto.accountName,
          // etc.
        },
      });

      await tx.transactions.create({
        data: {
          transaction_reference: reference,
          sender_wallet_id: wallet!.id,
          transaction_type: 'withdrawal',
          status: 'pending',
          amount,
          fee,
          net_amount: settlement,
          currency: 'FARM',
          description: `Pending withdrawal ${amount} FARM`,
          metadata: {
            method: dto.method,
            userId,
            reference,
          },
        },
      });

      return created;
    });

    // Fire-and-forget transfer initiation
    setImmediate(() => this.processWithdrawal(reference).catch(console.error));

    return { success: true, reference, withdrawal };
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWithdrawal(id: string) {
    return this.prisma.withdrawal.findUnique({ where: { id } });
  }

  private async processWithdrawal(reference: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal || withdrawal.status !== 'PENDING') return;

    await this.prisma.withdrawal.update({ where: { reference }, data: { status: 'PROCESSING' } });

    try {
      let recipient: any;

      if (withdrawal.method === 'MOBILE_MONEY') {
        recipient = await this.paystack.createTransferRecipient({
          type: 'mobile_money',
          name: 'M-Pesa User',
          phone: withdrawal.phoneNumber,
        });
      } else if (withdrawal.method === 'BANK_TRANSFER') {
        // resolve bankCode...
        recipient = await this.paystack.createTransferRecipient({
          type: 'nuban',
          name: withdrawal.accountName!,
          accountNumber: withdrawal.accountNumber!,
          bankCode: this.resolveBankCode(withdrawal.bankName!),
        });
      } else {
        // CRYPTO via Ivorypay or other
      }

      await this.paystack.initiateTransfer({
        amount: withdrawal.settlement, // or full amount depending on fee handling
        recipient: recipient.recipient_code,
        reference,
      });
      // Do NOT mark success here – wait for webhook
    } catch (e) {
      await this.rejectWithdrawal(reference, e.message);
    }
  }

  // Called from webhook
  async markAsSuccess(reference: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal) return false;

    await this.prisma.withdrawal.update({
      where: { reference },
      data: { status: 'COMPLETED' },
    });

    return true;
  }

  async rejectWithdrawal(reference: string, reason: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal) return false;

    await this.prisma.withdrawal.update({
      where: { reference },
      data: { status: 'FAILED' },
    });

    return true;
  }

  private resolveBankCode(bankName: string) {
    return bankName?.toUpperCase() ?? bankName;
  }
}