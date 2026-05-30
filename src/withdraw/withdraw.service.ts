import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';

import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WithdrawService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
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
        // Try to atomically increment locked_balance only if available balance covers amount
        const updated = await tx.$executeRaw`
          UPDATE "wallets"
          SET "locked_balance" = "locked_balance" + ${amount}
          WHERE "id" = ${wallet.id} AND ("balance" - "locked_balance") >= ${amount}
        `;

        // $executeRaw returns the number of affected rows (Postgres)
        if (typeof updated === 'number' && updated === 0) {
          throw new BadRequestException('Insufficient wallet balance');
        }
      }

      return tx.withdrawal.create({
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
    });

    return {
      success: true,
      message: 'Withdrawal created successfully',
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
    // attempt to move withdrawal into processing (atomic)
    const updated = await this.prisma.withdrawal.updateMany({
      where: { reference, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (updated.count === 0) return false;

    // now load the withdrawal record
    const withdrawal = await this.prisma.withdrawal.findFirst({ where: { reference } });
    if (!withdrawal) return false;

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: withdrawal.userId, is_active: true },
    });

    if (!wallet) {
      await this.prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'SUCCESS' } });
      return true;
    }

    const previousBalance = Number(wallet.balance ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const withdrawAmount = Number(withdrawal.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: withdrawAmount },
          locked_balance: { decrement: Math.min(previousLocked, withdrawAmount) },
        },
      });

      await tx.ledger_entries.create({
        data: {
          wallet_id: wallet.id,
          entry_type: 'debit',
          amount: withdrawAmount,
          balance_before: previousBalance,
          balance_after: previousBalance - withdrawAmount,
          description: `Withdrawal settled — ref: ${reference}`,
        },
      });

      await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'SUCCESS' } });

      const transaction = await tx.transactions.findUnique({ where: { transaction_reference: reference } });
      if (transaction) {
        await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'completed', processed_at: new Date() } });
      }
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

    return true;
  }
}