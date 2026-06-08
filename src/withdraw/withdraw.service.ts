import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaystackService } from '../paystack/paystack.service';
import { NotificationsService } from '../notifications/notifications.service';

import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WithdrawService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private paystackService: PaystackService,
    private notificationsService: NotificationsService,
  ) {}

  async createWithdrawal(userId: string, dto: any) {
    // Verify transaction PIN before processing withdrawal
    if (!dto.pin) {
      throw new BadRequestException('Transaction PIN is required');
    }

    await this.authService.verifyPin(userId, dto.pin);

    const amount = Number(dto.amount);

    if (amount <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });

    let balance = 0;
    if (wallet) {
      balance = Number(wallet.balance ?? 0) - Number(wallet.locked_balance ?? 0);
    } else {
      const successfulDeposits = await this.prisma.deposit.findMany({
        where: {
          userId,
          status: 'SUCCESS',
        },
      });

      const successfulWithdrawals = await this.prisma.withdrawal.findMany({
        where: {
          userId,
          status: 'SUCCESS',
        },
      });

      const depositTotal = successfulDeposits.reduce((sum, d) => sum + d.amount, 0);
      const withdrawalTotal = successfulWithdrawals.reduce((sum, w) => sum + w.total, 0);
      balance = depositTotal - withdrawalTotal;
    }

    let feePercent = 0.015;

    if (dto.method === 'MOBILE_MONEY') {
      feePercent = 0.02;
    }

    if (dto.method === 'CRYPTO') {
      feePercent = 0.005;
    }

    const fee = amount * feePercent;
    const settlement = amount - fee;
    const total = amount;

    if (total > balance) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const reference = uuidv4();

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      if (wallet) {
        const updated = await tx.$executeRaw`
          UPDATE "wallets"
          SET "locked_balance" = "locked_balance" + ${amount}
          WHERE "id" = ${wallet.id} AND ("balance" - "locked_balance") >= ${amount}
        `;

        if (typeof updated === 'number' && updated === 0) {
          throw new BadRequestException('Insufficient wallet balance');
        }
      }

      const createdWithdrawal = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          fee,
          settlement,
          total,
          currency: 'KES',
          method: dto.method,
          accountName: dto.accountName,
          accountNumber: dto.accountNumber,
          bankName: dto.bankName,
          phoneNumber: dto.phoneNumber,
          cryptoAddress: dto.cryptoAddress,
          network: dto.network,
          reference,
          status: 'PENDING',
        },
      });

      await tx.transactions.create({
        data: {
          transaction_reference: reference,
          transaction_type: 'withdrawal',
          status: 'pending',
          amount,
          fee,
          net_amount: settlement,
          currency: 'KES',
          description: `Withdrawal request — ref: ${reference}`,
          sender_wallet_id: wallet?.id,
          metadata: {
            method: dto.method,
            accountName: dto.accountName,
            accountNumber: dto.accountNumber,
            bankName: dto.bankName,
            bankCode: dto.bankCode,
            phoneNumber: dto.phoneNumber,
            cryptoAddress: dto.cryptoAddress,
            network: dto.network,
            provider: dto.method === 'CRYPTO' ? 'crypto' : 'paystack',
          },
        },
      });

      return createdWithdrawal;
    });

    return {
      success: true,
      message: 'Withdrawal created successfully and is pending approval',
      withdrawal,
      balanceAfter: balance - total,
    };
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getWithdrawal(id: string) {
    const withdrawal =
      await this.prisma.withdrawal.findUnique({
        where: { id },
      });

    if (!withdrawal) {
      throw new NotFoundException(
        'Withdrawal not found',
      );
    }

    return withdrawal;
  }

  async approveWithdrawal(reference: string) {
    const withdrawal = await this.prisma.withdrawal.findFirst({ where: { reference } });
    if (!withdrawal) return false;

    await this.prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: 'PROCESSING' },
    });

    if (withdrawal.method === 'BANK_TRANSFER' || withdrawal.method === 'MOBILE_MONEY') {
      try {
        const recipient = await this.paystackService.createTransferRecipient({
          type: withdrawal.method === 'BANK_TRANSFER' ? 'nuban' : 'mobile_money',
          name: withdrawal.accountName ?? withdrawal.phoneNumber ?? 'FARM user',
          accountNumber: withdrawal.accountNumber,
          bankCode: withdrawal.bankCode ?? withdrawal.bankName,
          phone: withdrawal.phoneNumber,
          currency: 'KES',
        });

        const transfer = await this.paystackService.initiateTransfer({
          amount: Number(withdrawal.amount),
          recipient: recipient.recipient_code || recipient.recipientCode || recipient.code,
          reference,
          reason: `Withdrawal payout for ${reference}`,
          currency: 'KES',
        });

        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const metadata = {
            ...(transaction.metadata as any || {}),
            recipientCode: recipient.recipient_code || recipient.recipientCode || recipient.code,
            transferCode: transfer.transfer_code || transfer.transferCode || transfer.code,
            transferStatus: transfer.status,
          };
          await this.prisma.transactions.update({
            where: { id: transaction.id },
            data: { metadata },
          });
        }
      } catch (error) {
        const reason = `Transfer initiation failed: ${error instanceof Error ? error.message : String(error)}`;
        await this.rejectWithdrawal(reference, reason);
        return false;
      }
    }

    return true;
  }

  async markAsSuccess(reference: string) {
    const withdrawal = await this.prisma.withdrawal.findFirst({ where: { reference } });
    if (!withdrawal) return false;

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: withdrawal.userId, is_active: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (wallet) {
        const previousBalance = Number(wallet.balance ?? 0);
        const previousLocked = Number(wallet.locked_balance ?? 0);
        const amount = Number(withdrawal.amount);

        await tx.wallets.update({
          where: { id: wallet.id },
          data: {
            locked_balance: { decrement: Math.min(previousLocked, amount) },
            balance: { decrement: amount },
          },
        });

        await tx.ledger_entries.create({
          data: {
            wallet_id: wallet.id,
            entry_type: 'debit',
            amount,
            balance_before: previousBalance,
            balance_after: previousBalance - amount,
            description: `Withdrawal payout completed — ref: ${reference}`,
          },
        });
      }

      await tx.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'SUCCESS' },
      });

      const transaction = await tx.transactions.findUnique({ where: { transaction_reference: reference } });
      if (transaction) {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: { status: 'completed', processed_at: new Date() },
        });
      }
    });

    await this.notificationsService.createInApp(withdrawal.userId, {
      type: 'transaction',
      title: 'Withdrawal completed',
      body: `Your withdrawal of ${withdrawal.total} KES has been completed.`,
      metadata: { reference },
    });

    return true;
  }

  async rejectWithdrawal(reference: string, reason: string) {
    // atomically mark processing -> failed only if currently PROCESSING or PENDING
    const current = await this.prisma.withdrawal.findFirst({ where: { reference } });
    if (!current || (current.status !== 'PENDING' && current.status !== 'PROCESSING')) return false;

    // perform revert actions
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: current.userId, is_active: true } });

    await this.prisma.$transaction(async (tx) => {
      if (wallet) {
        const unlockAmount = Math.min(Number(wallet.locked_balance ?? 0), Number(current.amount));
        await tx.wallets.update({ where: { id: wallet.id }, data: { locked_balance: { decrement: unlockAmount } } });
      }

      await tx.withdrawal.update({ where: { id: current.id }, data: { status: 'FAILED', rejectionReason: reason } });

      const transaction = await tx.transactions.findUnique({ where: { transaction_reference: reference } });
      if (transaction) await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'failed', processed_at: new Date() } });
    });

    await this.notificationsService.createInApp(current.userId, {
      type: 'transaction',
      title: 'Withdrawal failed',
      body: `Your withdrawal request of ${current.total} KES failed. Reason: ${reason}`,
      metadata: { reference },
    });

    return true;
  }
}