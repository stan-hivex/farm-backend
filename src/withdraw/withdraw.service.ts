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
import { CurrencyConversionService } from '../currency/currency-conversion.service';

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
    private readonly currencyConversionService: CurrencyConversionService,
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

    const cryptoAddress = dto.cryptoAddress ?? dto.walletAddress ?? dto.walletaddress ?? dto.wallet_address;
    const cryptoAsset = dto.cryptoAsset ?? dto.token;
    const normalizedNetwork = dto.network?.trim();
    const method = dto.method;
    if (method === 'BANK_TRANSFER') {
      if (amount < 4999) {
        throw new BadRequestException('Minimum withdrawal amount for bank transfer is 4,999 FARM');
      }
      if (amount > 999999) {
        throw new BadRequestException('Maximum withdrawal amount for bank transfer is 999,999 FARM');
      }
    } else if (method === 'MOBILE_MONEY') {
      if (amount < 1499) {
        throw new BadRequestException('Minimum withdrawal amount for mobile money is 1,499 FARM');
      }
      if (amount > 249999) {
        throw new BadRequestException('Maximum withdrawal amount for mobile money is 249,999 FARM');
      }
    } else if (method === 'CRYPTO') {
      if (amount < 100) {
        throw new BadRequestException('Minimum withdrawal amount for crypto is 100 FARM');
      }
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
      if (!cryptoAddress || !cryptoAsset || !normalizedNetwork) {
        throw new BadRequestException('Crypto asset, address and network are required for cryptocurrency withdrawals');
      }
    } else {
      throw new BadRequestException(`Unsupported withdrawal method: ${dto.method}`);
    }

    const feePercent = dto.method === 'MOBILE_MONEY' ? 0.02 : 0.015;
    const fee = Number((amount * feePercent).toFixed(8));
    const settlement = Number((amount - fee).toFixed(8));
    const reference = uuidv4();
    const normalizedNetworkValue = dto.method === 'CRYPTO'
      ? (normalizedNetwork ? normalizedNetwork.toUpperCase() : dto.network ?? '')
      : dto.network ?? '';
    const normalizedCryptoAsset = dto.method === 'CRYPTO'
      ? (cryptoAsset ? cryptoAsset.toUpperCase() : (dto.cryptoAsset ?? ''))
      : (dto.cryptoAsset ?? '');

    let cryptoExchangeSnapshot: any = null;
    if (dto.method === 'CRYPTO') {
      const rate = await this.currencyConversionService.getCurrentRate();
      const farmUsdRate = Number(rate.farm_usd_rate ?? 0);
      const farmKesRate = Number(rate.farm_kes_rate ?? 1);
      const usdKesRate = Number(rate.usd_kes_rate ?? 150);
      const cryptoAmount = Number((settlement * farmUsdRate).toFixed(8));
      const amountUsd = Number((amount * farmUsdRate).toFixed(8));
      const feeUsd = Number((fee * farmUsdRate).toFixed(8));
      const settlementUsd = Number((settlement * farmUsdRate).toFixed(8));
      cryptoExchangeSnapshot = {
        farmAmount: amount,
        farmKesRate,
        usdKesRate,
        farmUsdRate,
        cryptoCurrency: normalizedCryptoAsset,
        cryptoAmount,
        network: normalizedNetworkValue,
        conversionTimestamp: new Date().toISOString(),
        amount_farm: amount,
        fee_farm: fee,
        settlement_farm: settlement,
        amount_usd: amountUsd,
        fee_usd: feeUsd,
        settlement_usd: settlementUsd,
        crypto_asset: normalizedCryptoAsset,
      };
    }

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
          cryptoAddress,
          cryptoAsset: normalizedCryptoAsset,
          network: normalizedNetworkValue,
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
            cryptoAsset: normalizedCryptoAsset,
            network: normalizedNetworkValue,
            conversion_snapshot: cryptoExchangeSnapshot,
          },
        },
      });

      return created;
    });

    setImmediate(() => this.processWithdrawal(reference).catch((error) => this.logger.error(error?.message ?? error)));

    await this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`);
    await this.cache.cacheInvalidatePattern(`dashboard:${userId}`);
    await this.cache.cacheInvalidatePattern(`transactions:${userId}:*`);

    return { success: true, reference, withdrawal };
  }

  async getUserWithdrawals(userId: string) {
    return this.prisma.withdrawal.findMany({
      where: { userId, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWithdrawal(id: string, userId?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return null;
    }

    assertResourceAccess(withdrawal.userId, userId, 'withdrawal');
    return withdrawal;
  }

  // Return provider-supported networks for a token in a frontend-friendly shape
  async getProviderNetworks(token: string) {
    const normalizedToken = (token ?? '').toString().trim().toUpperCase();
    if (!normalizedToken) return { data: [] };
    const providerNetworks = await (this.ivorypay as any).fetchProviderNetworks(normalizedToken);
    const formatted = (providerNetworks ?? []).map((code: string) => {
      const display = code
        .toString()
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return { providerCode: code, displayName: display };
    });
    return { data: formatted };
  }

  async getWithdrawalStatus(reference: string, userId: string) {
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
      const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
      const metadata = (transaction?.metadata as any) ?? {};
      const snapshot = metadata.conversion_snapshot ?? null;
      const rate = snapshot ? {
        farm_usd_rate: Number(snapshot.farmUsdRate ?? snapshot.farm_usd_rate ?? 0),
        farm_kes_rate: Number(snapshot.farmKesRate ?? snapshot.farm_kes_rate ?? 1),
        usd_kes_rate: Number(snapshot.usdKesRate ?? snapshot.usd_kes_rate ?? 150),
      } : await this.currencyConversionService.getCurrentRate();
      const farmUsdRate = Number(rate.farm_usd_rate ?? 0);
      const cryptoAddress = withdrawal.cryptoAddress ?? withdrawal.walletAddress ?? withdrawal.walletaddress ?? withdrawal.wallet_address ?? '';
      const cryptoAsset = ((withdrawal.cryptoAsset ?? withdrawal.token ?? 'USDT') as string).toString().toUpperCase();
      const normalizedNetwork = (withdrawal.network ?? 'POLYGON').toString().toUpperCase();
      const cryptoAmount = Number((Number(withdrawal.settlement ?? withdrawal.amount ?? 0) * farmUsdRate).toFixed(8));
      const settlementUsd = Number((Number(withdrawal.settlement ?? 0) * farmUsdRate).toFixed(8));

      if (!cryptoAsset || !['USDC', 'USDT'].includes(cryptoAsset)) {
        throw new BadRequestException('Unsupported crypto asset for IvoryPay withdrawal. Only USDC and USDT are allowed.');
      }
      // Use IvoryPay as the source of truth for supported networks
      const providerNetworks = await (this.ivorypay as any).fetchProviderNetworks(cryptoAsset);
      this.logger.log(`IvoryPay provider networks for ${cryptoAsset}: ${JSON.stringify(providerNetworks)}`);
      if (!Array.isArray(providerNetworks) || providerNetworks.length === 0) {
        throw new BadRequestException('This crypto network is currently unavailable.');
      }

      const desired = (normalizedNetwork ?? '').toString().trim().toUpperCase();
      let supportedNetwork: string | null = null;
      for (const n of providerNetworks) {
        if (!n) continue;
        const candidate = n.toString().toUpperCase();
        if (candidate === desired) {
          supportedNetwork = n;
          break;
        }
        const alias = candidate.replace(/[^A-Z0-9]/g, '');
        const desiredAlias = desired.replace(/[^A-Z0-9]/g, '');
        if (alias && desiredAlias && alias === desiredAlias) {
          supportedNetwork = n;
          break;
        }
      }

      this.logger.log(`IVORYPAY NETWORK MATCH requested=${normalizedNetwork} token=${cryptoAsset} matched=${supportedNetwork ?? 'none'}`);
      if (!supportedNetwork) {
        const msg = `${cryptoAsset} withdrawals are not currently available on ${normalizedNetwork}.`;
        const err = new BadRequestException(msg);
        try { (err as any).providerNetworks = providerNetworks; } catch {}
        throw err;
      }
      if (!cryptoAddress || cryptoAddress.trim().length < 10) {
        throw new BadRequestException('Destination wallet address is required for crypto withdrawal');
      }
      if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
        throw new BadRequestException('Invalid crypto conversion amount');
      }

      const opts: any = {
        reference,
        amount: cryptoAmount,
        crypto: cryptoAsset,
        token: cryptoAsset,
        cryptoAsset: cryptoAsset,
        to_address: cryptoAddress,
        address: cryptoAddress,
        network: supportedNetwork,
        metadata: {
          user_id: withdrawal.userId,
          reference,
          cryptoAsset: cryptoAsset,
          network: supportedNetwork,
          conversion_snapshot: {
            ...(snapshot ?? {}),
            farmAmount: Number(withdrawal.amount ?? 0),
            farmKesRate: Number(rate.farm_kes_rate ?? 1),
            usdKesRate: Number(rate.usd_kes_rate ?? 150),
            farmUsdRate: farmUsdRate,
            cryptoCurrency: cryptoAsset,
            cryptoAmount,
            network: supportedNetwork,
            conversionTimestamp: new Date().toISOString(),
          },
          settlement_usd: settlementUsd,
        },
      };

      const resp = await this.ivorypay.createWithdrawal(opts);
      const withdrawalId = resp?.data?.id || resp?.providerTransactionId || resp?.providerReference || null;

      if (transaction) {
        const existingMetadata = (transaction.metadata as any) ?? {};
        await this.prisma.transactions.update({
          where: { id: transaction.id },
          data: {
            metadata: {
              ...existingMetadata,
              provider: 'ivorypay',
              ivorypay_withdrawal_id: withdrawalId,
              ivorypay_withdrawal_status: 'pending',
              settlement_usd: settlementUsd,
              // persist raw provider response for debugging (non-sensitive parts)
              ivorypay_response_body: resp?.rawResponse ?? null,
            },
          },
        });
      }
      // Leave finalization to webhook or manual reconciliation
    } catch (e: any) {
      // If the Ivorypay service attached provider response details to the error, persist them
      try {
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (transaction) {
          const existingMetadata = (transaction.metadata as any) ?? {};
          const providerResponse = e?.providerResponse ?? e?.response ?? null;
          const providerStatus = e?.providerStatus ?? e?.response?.status ?? null;
          const providerNetworksFromErr = e?.providerNetworks ?? null;
          const failureMetadata = {
            ...existingMetadata,
            provider: 'ivorypay',
            ivorypay_failure_reason: e.message || existingMetadata.ivorypay_failure_reason || 'Ivorypay error',
            ivorypay_withdrawal_status: 'failed',
            ivorypay_response_body: providerResponse,
            ivorypay_response_status: providerStatus,
            ivorypay_provider_networks: providerNetworksFromErr,
          };
          await this.prisma.transactions.update({ where: { id: transaction.id }, data: { metadata: failureMetadata } });
        }
      } catch (innerErr: any) {
        this.logger.debug(`Failed to persist provider response for ${reference}: ${innerErr?.message ?? innerErr}`);
      }

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