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

    if (amount < 10) {
      throw new BadRequestException('Withdrawal amount must be at least 10 FARM');
    }

    const method = String(dto.method || '').toUpperCase();
    if (!['BANK_TRANSFER', 'MOBILE_MONEY', 'CRYPTO'].includes(method)) {
      throw new BadRequestException('Unsupported withdrawal method');
    }

    if (method === 'BANK_TRANSFER') {
      if (!dto.accountNumber || !dto.accountName || !dto.bankName) {
        throw new BadRequestException(
          'Bank transfer withdrawals require account name, account number, and bank name',
        );
      }

      const bankCode = this.resolveBankCode(dto.bankName);
      if (!bankCode) {
        throw new BadRequestException(
          'Unsupported bank name. Provide a valid supported bank name for bank transfers.',
        );
      }
    }

    if (method === 'MOBILE_MONEY') {
      if (!dto.phoneNumber) {
        throw new BadRequestException('Phone number is required for mobile money withdrawals');
      }
      // Clear non-applicable fields for mobile money
      dto.accountName = undefined;
      dto.accountNumber = undefined;
      dto.bankName = undefined;
      dto.cryptoAddress = undefined;
      dto.network = undefined;
    }

    if (method === 'CRYPTO') {
      if (!dto.cryptoAddress) {
        throw new BadRequestException('Crypto address is required for crypto withdrawals');
      }
      // Clear non-applicable fields for crypto
      dto.accountName = undefined;
      dto.accountNumber = undefined;
      dto.bankName = undefined;
      dto.phoneNumber = undefined;
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

    if (method === 'MOBILE_MONEY') {
      feePercent = 0.02;
    }

    if (method === 'CRYPTO') {
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
        const available = Number(wallet.balance ?? 0) - Number(wallet.locked_balance ?? 0);
        if (amount > available) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        await tx.wallets.update({
          where: { id: wallet.id },
          data: { locked_balance: { increment: amount } },
        });
      }

      // Build withdrawal data with method-specific fields
      const withdrawalData: any = {
        userId,
        amount,
        fee,
        settlement,
        total,
        currency: 'KES',
        method,
        reference,
        status: 'PENDING',
      };

      // Add method-specific fields (other fields are cleared above)
      if (method === 'BANK_TRANSFER') {
        withdrawalData.accountName = dto.accountName;
        withdrawalData.accountNumber = dto.accountNumber;
        withdrawalData.bankName = dto.bankName;
      } else if (method === 'MOBILE_MONEY') {
        withdrawalData.phoneNumber = dto.phoneNumber;
      } else if (method === 'CRYPTO') {
        withdrawalData.cryptoAddress = dto.cryptoAddress;
        withdrawalData.network = dto.network;
      }

      const createdWithdrawal = await tx.withdrawal.create({
        data: withdrawalData,
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
            method,
            ...(method === 'BANK_TRANSFER' && {
              accountName: dto.accountName,
              accountNumber: dto.accountNumber,
              bankName: dto.bankName,
            }),
            ...(method === 'MOBILE_MONEY' && {
              phoneNumber: dto.phoneNumber,
            }),
            ...(method === 'CRYPTO' && {
              cryptoAddress: dto.cryptoAddress,
              network: dto.network,
            }),
            provider: method === 'CRYPTO' ? 'crypto' : 'paystack',
          },
        },
      });

      return createdWithdrawal;
    });

    // Automatically process withdrawal with payment provider (async, doesn't block response)
    setImmediate(() => {
      this.approveWithdrawal(reference).catch(err => {
        // Log but don't fail - webhook can handle it too
        console.error(`Auto-approval failed for withdrawal ${reference}:`, err);
      });
    });

    return {
      success: true,
      message: 'Withdrawal submitted successfully. Processing with your bank...',
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
        let recipientData: any = {
          currency: 'KES',
        };

        if (withdrawal.method === 'BANK_TRANSFER') {
          const bankCode = this.resolveBankCode(withdrawal.bankName || '');
          if (!bankCode) {
            throw new Error(`Unsupported bank name for Paystack nuban transfer: ${withdrawal.bankName}`);
          }

          recipientData = {
            ...recipientData,
            type: 'nuban',
            name: withdrawal.accountName || 'FARM user',
            accountNumber: withdrawal.accountNumber,
            bankCode,
          };
        } else {
          // MOBILE_MONEY
          recipientData = {
            ...recipientData,
            type: 'mobile_money',
            name: withdrawal.phoneNumber || 'FARM user',
            phone: withdrawal.phoneNumber,
          };
        }

        const recipient = await this.paystackService.createTransferRecipient(recipientData);

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
        console.error('approveWithdrawal error', {
          reference,
          method: withdrawal.method,
          bankName: withdrawal.bankName,
          phoneNumber: withdrawal.phoneNumber,
          error: error instanceof Error ? error.message : String(error),
        });

        const reason = `Transfer initiation failed: ${error instanceof Error ? error.message : String(error)}`;
        await this.rejectWithdrawal(reference, reason);
        return false;
      }
    }

    return true;
  }

  private resolveBankCode(bankName: string): string | undefined {
    if (!bankName) return undefined;
    const normalized = bankName.trim().toLowerCase();
    const bankMap: Record<string, string> = {
      'access bank': '044',
      'diamond bank': '063',
      'ecobank': '050',
      'fidelity bank': '070',
      'first bank': '011',
      'first city monument bank': '214',
      'fcmb': '214',
      'gtbank': '058',
      'guaranty trust bank': '058',
      'heritage bank': '030',
      'jaiz bank': '301',
      'polaris bank': '076',
      'stanbic ibtc bank': '221',
      'standard chartered': '068',
      'sterling bank': '232',
      'union bank': '032',
      'unity bank': '215',
      'wema bank': '035',
      'zenith bank': '057',
      'keystone bank': '082',
      'heritage bank plc': '030',
      'opal bank': '013',
      'first city': '214',
      'co-operative bank': '063',
      'cooperative bank': '063',
    };
    return bankMap[normalized];
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