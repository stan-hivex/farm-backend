// src/withdraw/withdraw.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { CreateWithdrawDto } from './dto/create-withdraw.dto';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../common/cache/cache.service';
import { assertResourceAccess } from '../common/utils/access-control.util';
import { NotificationsService } from '../notifications/notifications.service';

const WITHDRAWAL_FEE_RATE = 0.015;

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private securityService: SecurityService,
    private paystack: PaystackService,
    private ivorypay: IvorypayService,
    private cache: CacheService,
    private notificationsService: NotificationsService,
  ) {}

  async createWithdrawal(userId: string, dto: CreateWithdrawDto) {
    // Support biometric-based authorization: verify device fingerprint server-side
    if (dto.biometric_auth) {
      const deviceFingerprint = dto.device_fingerprint || (dto as any).deviceFingerprint;
      if (!deviceFingerprint) throw new BadRequestException('Device fingerprint required for biometric authorization');
      const verified = await this.securityService.verifyDevice(userId, deviceFingerprint);
      if (!verified || (verified as any).trusted !== true) {
        throw new BadRequestException('Biometric device verification failed');
      }
    } else {
      if (!dto.pin) throw new BadRequestException('Transaction PIN is required');
      await this.authService.verifyPin(userId, dto.pin);
    }

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const limits = this.getWithdrawalLimits(dto.method);
    if (amount < limits.min || (limits.max !== null && amount > limits.max)) {
      throw new BadRequestException(
        `Invalid withdrawal amount for ${dto.method}. Allowed range is ${this.formatAmount(limits.min)}${limits.max !== null ? ` - ${this.formatAmount(limits.max)}` : '+'} FARM`,
      );
    }

    if (dto.method === 'BANK_TRANSFER' && amount < 4999) {
      throw new BadRequestException('Bank transfer withdrawals must be at least 4999 FARM');
    }
    if (dto.method === 'BANK_TRANSFER' && amount > 999999) {
      throw new BadRequestException('Bank transfer withdrawals cannot exceed 999999 FARM');
    }
    if (dto.method === 'MOBILE_MONEY' && amount < 1499) {
      throw new BadRequestException('Mobile money withdrawals must be at least 1499 FARM');
    }
    if (dto.method === 'MOBILE_MONEY' && amount > 249999) {
      throw new BadRequestException('Mobile money withdrawals cannot exceed 249999 FARM');
    }
    if (dto.method === 'CRYPTO' && amount < 100) {
      throw new BadRequestException('Crypto withdrawals must be at least 100 FARM');
    }

    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
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
      if (!dto.cryptoAddress || !dto.cryptoAsset || !dto.network) {
        throw new BadRequestException('Crypto asset, address and network are required for cryptocurrency withdrawals');
      }
    } else {
      throw new BadRequestException(`Unsupported withdrawal method: ${dto.method}`);
    }

    const isSuperadmin = user.role === 'super_admin';
    const fee = isSuperadmin ? 0 : Number((amount * WITHDRAWAL_FEE_RATE).toFixed(8));
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
          cryptoAsset: dto.cryptoAsset,
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
          description: 'Pending withdrawal',
          metadata: {
            method: dto.method,
            provider: dto.method === 'CRYPTO' ? 'ivorypay' : 'paystack',
            user_id: userId,
            reference,
            cryptoAsset: dto.cryptoAsset,
            network: dto.network,
          },
        },
      });

      return created;
    });

    setImmediate(() => this.processWithdrawal(reference).catch((error) => this.logger.error(error?.message ?? error)));

    await this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`);
    await this.cache.cacheInvalidatePattern(`dashboard:${userId}`);
    await this.cache.cacheInvalidatePattern(`transactions:${userId}:*`);
    await this.cache.cacheInvalidatePattern(`withdrawals:${userId}`);
    await this.cache.cacheInvalidatePattern(`withdrawal-status:${reference}:*`);

    return { success: true, reference, withdrawal };
  }

  async getUserWithdrawals(userId: string) {
    const cacheKey = `withdrawals:${userId}`;
    const cached = await this.cache.cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: { userId, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
    });

    await this.cache.cacheSet(cacheKey, withdrawals, 45);
    return withdrawals;
  }

  async getWithdrawal(id: string, userId?: string) {
    const cacheKey = `withdrawal:${id}:${userId ?? 'anonymous'}`;
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return null;
    }

    assertResourceAccess(withdrawal.userId, userId, 'withdrawal');
    await this.cache.cacheSet(cacheKey, withdrawal, 60);
    return withdrawal;
  }

  async getWithdrawalStatus(reference: string, userId: string) {
    const cacheKey = `withdrawal-status:${reference}:${userId}`;
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { reference, userId },
    });
    if (!withdrawal) {
      return null;
    }

    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    const metadata = (transaction?.metadata as any) ?? {};
    const statusResult: any = {
      reference,
      withdrawal_status: withdrawal.status,
      provider: metadata.provider ?? (withdrawal.method === 'CRYPTO' ? 'ivorypay' : 'paystack'),
      method: withdrawal.method,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      rejection_reason: withdrawal.rejectionReason,
    };

    if (withdrawal.method === 'CRYPTO') {
      statusResult.ivorypay_withdrawal_id = metadata.ivorypay_withdrawal_id;
      statusResult.ivorypay_withdrawal_status = metadata.ivorypay_withdrawal_status;
      statusResult.ivorypay_failure_reason = metadata.ivorypay_failure_reason;
    } else {
      statusResult.paystack_transfer_code = metadata.paystack_transfer_code;
      statusResult.paystack_transfer_status = metadata.paystack_transfer_status;
      statusResult.paystack_failure_reason = metadata.paystack_failure_reason;
      if (metadata.paystack_transfer_code) {
        try {
          const transferStatus = await this.paystack.getTransferStatus(metadata.paystack_transfer_code);
          statusResult.paystack_transfer_details = transferStatus;
          statusResult.paystack_transfer_status = transferStatus.status || statusResult.paystack_transfer_status;
        } catch (e: any) {
          statusResult.paystack_transfer_status_error = e.message || 'Unable to query paystack transfer status';
        }
      }
    }

    await this.cache.cacheSet(cacheKey, statusResult, 30);
    return statusResult;
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
          name: withdrawal.accountName || 'FARM User',
          account_number: this.formatMpesaNumber(withdrawal.phoneNumber),
          mobile_number: this.formatMpesaNumber(withdrawal.phoneNumber),
          provider: 'MPESA',
          bank_code: 'MPESA',
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
          country: 'KE',
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
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const metadata = (transaction.metadata as any) ?? {};
          const updatedMetadata = {
            ...metadata,
            paystack_transfer_code: transferData.transfer_code || transferData.id || metadata.paystack_transfer_code,
            paystack_transfer_status: transferData.status || metadata.paystack_transfer_status || 'pending',
            paystack_transfer_initiated_at: new Date().toISOString(),
          };
          await this.prisma.transactions.update({
            where: { id: transaction.id },
            data: { metadata: updatedMetadata },
          });
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
        crypto: withdrawal.cryptoAsset || 'USDT',
        to_address: withdrawal.cryptoAddress,
        metadata: {
          user_id: withdrawal.userId,
          reference,
          cryptoAsset: withdrawal.cryptoAsset,
          network: withdrawal.network,
        },
      };

      const resp = await this.ivorypay.createWithdrawal(opts);
      const withdrawalId = resp?.data?.id || resp?.id || null;

      // Save provider withdrawal id into transaction metadata
      const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
      if (transaction) {
        const metadata = (transaction.metadata as any) ?? {};
        await this.prisma.transactions.update({
          where: { id: transaction.id },
          data: {
            metadata: {
              ...metadata,
              provider: 'ivorypay',
              ivorypay_withdrawal_id: withdrawalId,
              ivorypay_withdrawal_status: 'pending',
            },
          },
        });
      }
      // Leave finalization to webhook or manual reconciliation
    } catch (e: any) {
      await this.rejectWithdrawal(reference, e.message || 'Crypto withdrawal failed');
    }
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
    const fee = Number((amount * WITHDRAWAL_FEE_RATE).toFixed(8));
    const previousBalance = Number(wallet.balance ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const unlockAmount = Math.min(previousLocked, amount);
    const superadminWallet = await this.findSuperadminWallet();

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

      if (superadminWallet && fee > 0) {
        await tx.wallets.update({
          where: { id: superadminWallet.id },
          data: { balance: { increment: fee } },
        });
      }

      if (transaction) {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            processed_at: new Date(),
            description: 'Successful withdrawal',
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

        if (superadminWallet && fee > 0) {
          await tx.ledger_entries.create({
            data: {
              transaction_id: transaction.id,
              wallet_id: superadminWallet.id,
              entry_type: 'credit',
              amount: fee,
              balance_before: Number(superadminWallet.balance ?? 0),
              balance_after: Number(superadminWallet.balance ?? 0) + fee,
              description: `Withdrawal fee credited — ref: ${reference}`,
            },
          });
        }
      }
    });

    await Promise.all([
      this.cache.cacheInvalidatePattern(`wallet:${withdrawal.userId}:balance`),
      this.cache.cacheInvalidatePattern(`dashboard:${withdrawal.userId}`),
      this.cache.cacheInvalidatePattern(`transactions:${withdrawal.userId}:*`),
      this.cache.cacheDelete('admin:dashboard:stats'),
      this.cache.cacheDelete('admin:analytics'),
      this.cache.cacheDelete('admin:superadmin-dashboard'),
    ]);

    await this.notificationsService.sendNotification(withdrawal.userId, {
      type: 'withdrawal_completed',
      title: 'Withdrawal completed',
      body: `Your withdrawal of ${Number(withdrawal.amount ?? 0)} FARM has been processed successfully.`,
      entityId: withdrawal.id,
      metadata: { reference, amount: Number(withdrawal.amount ?? 0), currency: withdrawal.currency || 'FARM' },
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
        const metadata = (transaction.metadata as any) ?? {};
        const failureMetadata = withdrawal.method === 'CRYPTO'
          ? {
              ...metadata,
              provider: 'ivorypay',
              ivorypay_failure_reason: reason,
              ivorypay_withdrawal_status: 'failed',
            }
          : {
              ...metadata,
              provider: 'paystack',
              paystack_failure_reason: reason,
              paystack_transfer_status: 'failed',
            };
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'failed',
            processed_at: new Date(),
            metadata: failureMetadata,
          },
        });
      }
    });

    await Promise.all([
      this.cache.cacheInvalidatePattern(`wallet:${withdrawal.userId}:balance`),
      this.cache.cacheInvalidatePattern(`dashboard:${withdrawal.userId}`),
      this.cache.cacheInvalidatePattern(`transactions:${withdrawal.userId}:*`),
      this.cache.cacheDelete('admin:dashboard:stats'),
      this.cache.cacheDelete('admin:analytics'),
      this.cache.cacheDelete('admin:superadmin-dashboard'),
    ]);

    await this.notificationsService.sendNotification(withdrawal.userId, {
      type: 'transaction',
      title: 'Withdrawal failed',
      body: reason ? `Your withdrawal could not be completed: ${reason}` : 'Your withdrawal could not be completed.',
      entityId: withdrawal.id,
      metadata: { reference, reason },
    });

    return true;
  }

  private getWithdrawalLimits(method: string) {
    switch (method) {
      case 'BANK_TRANSFER':
        return { min: 4999, max: 999999 };
      case 'MOBILE_MONEY':
        return { min: 1499, max: 249999 };
      case 'CRYPTO':
        return { min: 100, max: null };
      default:
        return { min: 10, max: null };
    }
  }

  private async findSuperadminWallet() {
    return this.prisma.wallets.findFirst({
      where: {
        wallet_type: 'operations',
        is_active: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  private formatAmount(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
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