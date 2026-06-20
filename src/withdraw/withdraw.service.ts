// src/withdraw/withdraw.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private paystack: PaystackService,
    private ivorypay: IvorypayService,
  ) {}

  async createWithdrawal(userId: string, dto: CreateWithdrawDto) {
    await this.authService.verifyPin(userId, dto.pin);

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }
    if (amount < 10) {
      throw new BadRequestException('Minimum withdrawal amount is 10 FARM');
    }

    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
    if (!wallet) {
      throw new BadRequestException('Active wallet not found');
    }

    const availableBalance = Number(wallet.balance ?? 0) - Number(wallet.locked_balance ?? 0);
    if (availableBalance < amount) {
      throw new BadRequestException('Insufficient balance for this withdrawal');
    }

    if (dto.method === 'MOBILE_MONEY') {
      if (!dto.phoneNumber) {
        throw new BadRequestException('Phone number is required for mobile money withdrawals');
      }
    } else if (dto.method === 'BANK_TRANSFER') {
      if (!dto.accountName || !dto.accountNumber || !dto.bankName) {
        throw new BadRequestException('Account name, account number and bank name are required for bank transfer withdrawals');
      }
    } else if (dto.method === 'CRYPTO') {
      if (!dto.cryptoAddress || !dto.network) {
        throw new BadRequestException('Crypto address and network are required for cryptocurrency withdrawals');
      }
    } else {
      throw new BadRequestException(`Unsupported withdrawal method: ${dto.method}`);
    }

    const feePercent = dto.method === 'MOBILE_MONEY' ? 0.02 : 0.015;
    const fee = Number((amount * feePercent).toFixed(8));
    const settlement = Number((amount - fee).toFixed(8));
    const reference = uuidv4();

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { locked_balance: { increment: amount } },
      });

      const created = await tx.withdrawal.create({
        data: {
          userId,
          amount,
          fee,
          settlement,
          total: amount,
          currency: 'FARM',
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
          sender_wallet_id: wallet.id,
          transaction_type: 'withdrawal',
          status: 'pending',
          amount,
          fee,
          net_amount: settlement,
          currency: 'FARM',
          description: `Pending withdrawal ${amount} FARM`,
          metadata: {
            method: dto.method,
            user_id: userId,
            reference,
          },
        },
      });

      return created;
    });

    setImmediate(() => this.processWithdrawal(reference).catch((error) => this.logger.error(error?.message ?? error)));

    return { success: true, reference, withdrawal };
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId, status: { not: 'FAILED' } },
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
        // For Paystack mobile money recipients, do NOT provide `account_number`.
        // Send a properly formatted E.164 mobile number (e.g. +2547...) in
        // `mobile_number` and include provider/currency. Supplying
        // `account_number` causes Paystack to validate as a bank account and
        // may return "Account number is invalid" for phone numbers.
        const mobileNumber = this.formatPhoneForPaystack(withdrawal.phoneNumber);
        recipient = await this.paystack.createTransferRecipient({
          type: 'mobile_money',
          name: withdrawal.accountName || 'FARM User',
          mobile_number: mobileNumber,
          provider: 'MPESA',
          currency: 'KES',
        });
      } else if (withdrawal.method === 'BANK_TRANSFER') {
        const bankCode = await this.paystack.getBankCodeByName(withdrawal.bankName || '');
        this.logger.log(`Resolved bank name='${withdrawal.bankName}' -> bank_code='${bankCode}'`);
        recipient = await this.paystack.createTransferRecipient({
          type: 'nuban',
          name: withdrawal.accountName!,
          account_number: withdrawal.accountNumber!,
          bank_code: bankCode,
          currency: 'KES',
        });
      } else if (withdrawal.method === 'CRYPTO') {
        // Off-chain crypto withdrawal via Ivorypay (or mock)
        await this.processCryptoWithdrawal(withdrawal, reference);
      } else {
        throw new BadRequestException('Unsupported withdrawal method for transfer processing');
      }

      if (recipient) {
        const transferResponse = await this.paystack.initiateTransfer({
          amount: withdrawal.settlement,
          recipient: recipient.recipient_code,
          reference,
          currency: 'KES',
        });

        const transferData = transferResponse?.data ?? {};
        if (transferData.transfer_code) {
          const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
          if (transaction) {
            const metadata = (transaction.metadata as any) ?? {};
            await this.prisma.transactions.update({
              where: { id: transaction.id },
              data: { metadata: { ...metadata, paystack_transfer_code: transferData.transfer_code } },
            });
          }
        }
      }
      // Do NOT mark success here – wait for webhook or provider callback
    } catch (e: any) {
      await this.rejectWithdrawal(reference, e.message || 'Withdrawal transfer failed');
    }
  }

  // Support crypto withdrawal processing using Ivorypay (or a stub if not configured)
  private async processCryptoWithdrawal(withdrawal: any, reference: string) {
    try {
      const opts: any = {
        reference,
        amount: withdrawal.settlement,
        crypto: withdrawal.network || 'USDT',
        to_address: withdrawal.cryptoAddress,
        metadata: { user_id: withdrawal.userId, reference },
      };

      const resp = await this.ivorypay.createWithdrawal(opts);
      const withdrawalId = resp?.data?.id || resp?.id || null;

      // Save provider withdrawal id into transaction metadata
      const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
      if (transaction) {
        const metadata = (transaction.metadata as any) ?? {};
        await this.prisma.transactions.update({ where: { id: transaction.id }, data: { metadata: { ...metadata, ivorypay_withdrawal_id: withdrawalId } } });
      }
      // Leave finalization to webhook or manual reconciliation
    } catch (e: any) {
      await this.rejectWithdrawal(reference, e.message || 'Crypto withdrawal failed');
    }
  }

  // Normalize phone numbers to E.164 for Paystack (e.g. +2547xxxxxxxx)
  private formatPhoneForPaystack(phone: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.startsWith('254')) return '+' + digits;
    if (digits.startsWith('0')) return '+254' + digits.substring(1);
    if (!digits.startsWith('+') && digits.length >= 9) return '+' + digits;
    return phone;
  }

  // Called from webhook
  async markAsSuccess(reference: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal) return false;
    if (withdrawal.status === 'COMPLETED') return true;

    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: withdrawal.userId, is_active: true } });
    if (!wallet) return false;

    const amount = Number(withdrawal.amount ?? 0);
    const previousBalance = Number(wallet.balance ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const unlockAmount = Math.min(previousLocked, amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { reference },
        data: { status: 'COMPLETED' },
      });

      await tx.wallets.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: amount },
          locked_balance: { decrement: unlockAmount },
        },
      });

      if (transaction) {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            processed_at: new Date(),
          },
        });

        await tx.ledger_entries.create({
          data: {
            transaction_id: transaction.id,
            wallet_id: wallet.id,
            entry_type: 'debit',
            amount,
            balance_before: previousBalance,
            balance_after: previousBalance - amount,
            description: `Withdrawal completed — ref: ${reference}`,
          },
        });
      }
    });

    return true;
  }

  async rejectWithdrawal(reference: string, reason: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
    if (!withdrawal) return false;
    if (withdrawal.status === 'FAILED') return true;

    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: withdrawal.userId, is_active: true } });
    if (!wallet) return false;

    const amount = Number(withdrawal.amount ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const unlockAmount = Math.min(previousLocked, amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { reference },
        data: { status: 'FAILED', rejectionReason: reason },
      });

      await tx.wallets.update({
        where: { id: wallet.id },
        data: { locked_balance: { decrement: unlockAmount } },
      });

      if (transaction) {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'failed',
            processed_at: new Date(),
          },
        });
      }
    });

    return true;
  }

  private formatMpesaNumber(phone: string | null) {
    if (!phone) return phone || '';
    if (phone.startsWith('+254')) {
      return '0' + phone.substring(4);
    }
    return phone;
  }

  private resolveBankCode(bankName: string) {
    return bankName?.toUpperCase() ?? bankName;
  }
}