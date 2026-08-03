// src/deposit/deposit.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../common/cache/cache.service';
import { assertResourceAccess } from '../common/utils/access-control.util';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveDepositCreditAmount } from './deposit.utils';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private ivorypay: IvorypayService,
    private websocket: WebsocketGateway,
    private cache: CacheService,
    private notificationsService: NotificationsService,
  ) {}

  async createDeposit(userId: string, dto: any) {
    const paymentMethod = (
      dto.paymentMethod ||
      dto.payment_method ||
      dto.method ||
      dto.payment_channel ||
      dto.payment_provider ||
      'CARD'
    ).toUpperCase();

    if (paymentMethod === 'CRYPTO') {
      this.logger.log(`DepositService: delegating crypto deposit to dedicated IvoryPay flow for user=${userId}`);
      throw new BadRequestException('Crypto deposits must use the dedicated /api/v1/crypto/deposit endpoint');
    }

    const amount = Number(dto.amount_fiat);
    if (!Number.isFinite(amount) || amount < 10) {
      throw new BadRequestException(`Invalid deposit amount. Minimum deposit is 10 ${dto.currency || 'KES'}`);
    }

    const reference = uuidv4();
    const provider = 'paystack';
    const feeRate = paymentMethod === 'MOBILE_MONEY' ? 0.015 : 0.02;
    const fee = amount * feeRate;
    const total = amount + fee;

    const depositCurrency = paymentMethod === 'CRYPTO' ? 'FARM' : dto.currency || 'KES';
    const depositAmount = amount;
    const depositFee = paymentMethod === 'CRYPTO' ? 0 : fee;
    const depositTotal = paymentMethod === 'CRYPTO' ? amount : total;

    let providerRef = reference;
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount: depositAmount,
        fee: depositFee,
        total: depositTotal,
        currency: depositCurrency,
        paymentMethod,
        provider,
        reference,
        status: 'PENDING',
        providerRef,
      },
    });

    const createdAmount = deposit.amount;
    let paymentUrl: string | null = null;

    if (paymentMethod !== 'CRYPTO') {
      await this.prisma.transactions.create({
        data: {
          transaction_reference: reference,
          transaction_type: 'deposit',
          status: 'pending',
          amount: total,
          fee: 0,
          net_amount: total,
          currency: dto.currency || 'KES',
          description: `Pending ${paymentMethod} deposit via ${provider.toUpperCase()} (${depositCurrency} ${total})`,
          metadata: {
            provider,
            amount_fiat: amount,
            currency_fiat: dto.currency || 'KES',
            exchange_rate: 1,
            user_id: userId,
            payment_method: paymentMethod,
            deposit_id: deposit.id,
          },
        },
      });
    }

    if (paymentMethod === 'CRYPTO') {
      const farmAmount = depositAmount;
      const farmToUsdRate = 130;
      const amountUsd = Number((farmAmount / farmToUsdRate).toFixed(2));

      const init = await this.ivorypay.createPayment({
        amount: amountUsd,
        currency: 'USD',
        reference,
        email: dto.email || `${userId}@farm.app`,
        description: `Farm deposit ${farmAmount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
        baseFiat: 'USD',
        metadata: {
          provider: 'ivorypay',
          amount_farm: farmAmount,
          amount_usd: amountUsd,
          farm_to_usd_rate: farmToUsdRate,
          currency_fiat: 'USD',
          user_id: userId,
          payment_method: 'CRYPTO',
        },
      });
      providerRef = init.providerReference ?? init.data?.id ?? init.data?.reference ?? reference;
      if (providerRef !== reference) {
        await this.prisma.deposit.update({ where: { id: deposit.id }, data: { providerRef } });
      }
      paymentUrl = init.data?.payment_link || init.payment_link || init.checkout_url;

      await this.prisma.transactions.create({
        data: {
          transaction_reference: reference,
          transaction_type: 'deposit',
          status: 'pending',
          amount: farmAmount,
          fee: 0,
          net_amount: farmAmount,
          currency: 'FARM',
          description: `Pending crypto deposit via Ivorypay (${farmAmount} FARM → ${amountUsd} USD)`,
          metadata: {
            provider: 'ivorypay',
            provider_ref: providerRef,
            amount_farm: farmAmount,
            amount_usd: amountUsd,
            farm_to_usd_rate: farmToUsdRate,
            currency_fiat: 'USD',
            user_id: userId,
            payment_method: 'CRYPTO',
          },
        },
      });

      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_initiated',
          entity_type: 'transaction',
          entity_id: null,
          new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm: farmAmount },
        },
      });

      return {
        data: {
          provider: 'IVORYPAY',
          reference,
          payment_url: init.data?.payment_link || init.payment_link,
          authorization_url: init.data?.payment_link || init.payment_link,
        },
        message: 'Crypto deposit initiated via Ivorypay',
      };
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
      const init = await this.paystack.initializePayment({
        email: dto.email || `${userId}@farm.app`,
        amount: total,
        reference,
        currency: 'KES',
        channels: ['card'],
        metadata: { userId, depositId: deposit.id, paymentMethod },
      });
      paymentUrl = init.authorization_url || init.authorizationUrl;
    } else if (paymentMethod === 'BANK_TRANSFER') {
      const init = await this.paystack.initializePayment({
        email: dto.email || `${userId}@farm.app`,
        amount: total,
        reference,
        currency: 'KES',
        channels: ['bank_transfer'],
        metadata: { userId, depositId: deposit.id, paymentMethod },
      });
      paymentUrl = init.authorization_url || init.authorizationUrl;
    } else {
      throw new BadRequestException(`Unsupported payment method ${paymentMethod}`);
    }

    await this.cache.cacheInvalidatePattern(`deposits:${userId}`);
    await this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`);

    return {
      success: true,
      payment_url: paymentUrl,
      authorization_url: paymentUrl,
      reference,
      deposit,
    };
  }

  async getUserDeposits(userId: string) {
    const cacheKey = `deposits:${userId}`;
    const cached = await this.cache.cacheGet<any[]>(cacheKey);
    if (cached) return cached;

    // Return only successfully completed deposits to users.
    // Failed, pending or processing deposits are intentionally hidden
    // so the frontend shows only confirmed funds the webhook has validated.
    const deposits = await this.prisma.deposit.findMany({
      where: { userId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });

    await this.cache.cacheSet(cacheKey, deposits, 45);
    return deposits;
  }

  async getWalletBalance(userId: string) {
    const cacheKey = `wallet:${userId}:balance`;
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    const payload = { balance: wallet?.balance ?? 0, locked_balance: wallet?.locked_balance ?? 0 };
    await this.cache.cacheSet(cacheKey, payload, 30);
    return payload;
  }

  async getDepositById(id: string, userId?: string) {
    const cacheKey = `deposit:${id}:${userId ?? 'anonymous'}`;
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const deposit = await this.prisma.deposit.findUnique({ where: { id } });
    if (!deposit) return null;
    assertResourceAccess(deposit.userId, userId, 'deposit');
    if (deposit.status !== 'SUCCESS') return null;

    await this.cache.cacheSet(cacheKey, deposit, 60);
    return deposit;
  }

  // Called ONLY from webhook
  async finalizeSuccessfulDeposit(reference: string) {
    this.logger.log(`finalizeSuccessfulDeposit: start for reference=${reference}`);
    let deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    if (!transaction) {
      throw new BadRequestException(`Transaction not found for reference: ${reference}`);
    }

    // Extra guard: verify provider's authoritative status for this reference
    try {
      const metadata = (transaction.metadata as any) ?? {};
      const provider = (metadata?.provider?.toString()?.toLowerCase() || deposit?.provider?.toLowerCase() || 'unknown').trim();
      if (provider === 'paystack') {
        try {
          const verified = await this.paystack.verifyTransaction(reference);
          if (!verified || (verified.status ?? '').toString().toLowerCase() !== 'success') {
            this.logger.warn(`finalizeSuccessfulDeposit: paystack verify indicates non-success for ${reference} status=${verified?.status ?? 'unknown'} - aborting credit`);
            return false;
          }
        } catch (e) {
          this.logger.warn(`finalizeSuccessfulDeposit: paystack verify failed for ${reference} - aborting credit`, e as any);
          return false;
        }
      }
    } catch (e) {
      this.logger.debug('finalizeSuccessfulDeposit: provider verification skipped due to error', e as any);
    }

    if (!deposit && transaction?.amount) {
      const metadata = transaction.metadata as any;
      const userId = metadata?.user_id;
      const paymentMethod = metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'CRYPTO' : 'CARD';
      if (!userId) {
        this.logger.warn(`Deposit missing for reference ${reference} but transaction metadata.user_id is unavailable`);
      } else {
        this.logger.warn(`Deposit missing for reference ${reference}, reconstructing from transaction`);
        deposit = await this.prisma.deposit.create({
          data: {
            reference,
            amount: Number(transaction.amount),
            fee: 0,
            total: Number(transaction.amount),
            currency: transaction.currency || 'FARM',
            paymentMethod,
            provider: metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'ivorypay' : 'paystack',
            status: 'PENDING',
            userId,
          },
        });
      }
    }

    const depositPending = !!deposit && deposit.status === 'PENDING';
    const depositComplete = !!deposit && deposit.status === 'SUCCESS';
    const isDeposit = transaction.transaction_type?.toLowerCase() === 'deposit';
    const txStatus = transaction.status?.toLowerCase();
    const txPending = isDeposit && ['pending', 'processing'].includes(txStatus ?? '');
    const txComplete = isDeposit && txStatus === 'completed';
    const txFailed = isDeposit && ['failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');
    const txUnknown = isDeposit && !['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');

    if (txFailed || txUnknown) {
      this.logger.warn(`finalizeSuccessfulDeposit: transaction ${reference} status=${transaction.status} - not crediting wallet`);
      return false;
    }

    if (depositComplete && txComplete) {
      this.logger.log(`finalizeSuccessfulDeposit: already completed for ${reference}`);
      return true;
    }

    if (depositPending && txPending) {
      return this.finalizePendingDepositWithTransaction(reference, deposit!, transaction);
    }

    if (depositPending) {
      return this.creditPendingDepositWithWallet(reference, deposit!, transaction);
    }

    if (depositComplete && txPending) {
      return this.completePendingTransaction(reference, transaction);
    }

    if (txPending) {
      return this.creditPendingTransactionDeposit(reference);
    }

    this.logger.warn(`finalizeSuccessfulDeposit: transaction ${reference} status=${transaction.status} is not eligible for wallet credit`);
    return false;
  }

  async failDeposit(reference: string, reason?: string) {
    const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    if (!deposit && !transaction) {
      this.logger.warn(`failDeposit: no deposit or transaction found for reference=${reference}`);
      return false;
    }

    const metadata = (transaction?.metadata as any) ?? {};
    const failureMetadata = {
      ...metadata,
      failure_reason: reason ?? metadata.failure_reason,
    };

    await this.prisma.$transaction(async (tx) => {
      if (deposit && deposit.status === 'PENDING') {
        await tx.deposit.update({ where: { id: deposit.id }, data: { status: 'FAILED' } });
      }

      if (transaction && !['failed', 'cancelled', 'completed'].includes(transaction.status?.toLowerCase() ?? '')) {
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

    this.logger.log(`failDeposit: marked ${reference} as failed${reason ? ` reason=${reason}` : ''}`);

    // Emit websocket update so frontend clients can react in real-time
    try {
      const metadata2 = (transaction?.metadata as any) ?? {};
      const userId = deposit?.userId ?? metadata2?.user_id;
      if (userId) {
        this.websocket.emitTransactionUpdate(userId, {
          reference,
          status: 'FAILED',
          reason: failureMetadata.failure_reason ?? reason,
        });
        await this.notificationsService.sendNotification(userId, {
          type: 'transaction',
          title: 'Deposit failed',
          body: reason ? `Your deposit could not be completed: ${reason}` : 'Your deposit could not be completed.',
          entityId: reference,
          metadata: { reference },
        });
      }
    } catch (e) {
      this.logger.debug('Failed to emit websocket update for failed deposit', e as any);
    }

    return true;
  }

  private async finalizePendingDepositWithTransaction(reference: string, deposit: any, transaction: any) {
    if (!transaction || !transaction.id) {
      throw new BadRequestException(`Invalid transaction for deposit finalization: reference=${reference}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet = await tx.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
      if (!wallet) {
        wallet = await tx.wallets.create({
          data: {
            user_id: deposit.userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: deposit.currency || 'FARM',
          },
        });
      }

      const updatedDeposit = await tx.deposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'SUCCESS' },
      });
      if (updatedDeposit.count === 0) {
        return { ok: false };
      }

      const amount = this.normalizeAmount(resolveDepositCreditAmount(transaction, deposit));
      const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));

      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount,
          balance_before: previousBalance,
          balance_after: previousBalance + amount,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      if (transaction.status?.toLowerCase() !== 'completed') {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            receiver_wallet_id: transaction.receiver_wallet_id ?? wallet.id,
            processed_at: new Date(),
          },
        });
      }

      return { ok: true };
    });

    if (result.ok) {
      await this.invalidateFinancialCaches(deposit?.userId);
    }

    return result.ok;
  }

  private async completePendingTransaction(reference: string, transaction: any) {
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    const txStatus = transaction.status?.toLowerCase();
    if (txStatus === 'completed') {
      return true;
    }

    if (!['pending', 'processing'].includes(txStatus ?? '')) {
      this.logger.warn(`completePendingTransaction: transaction ${reference} status=${transaction.status} cannot be completed automatically`);
      return false;
    }

    const updates: any = {
      status: 'completed',
      processed_at: new Date(),
    };

    if (!transaction.receiver_wallet_id) {
      const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
      if (deposit) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
        if (wallet) updates.receiver_wallet_id = wallet.id;
      }
    }

    await this.prisma.transactions.update({
      where: { id: transaction.id },
      data: updates,
    });

    await this.invalidateFinancialCaches(transaction?.metadata?.user_id ?? undefined);

    return true;
  }

  private async creditPendingTransactionDeposit(reference: string) {
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    const isDeposit = transaction.transaction_type?.toLowerCase() === 'deposit';
    if (!isDeposit) return false;
    const txStatus = transaction.status?.toLowerCase();
    if (txStatus === 'completed') return true;
    if (!['pending', 'processing'].includes(txStatus ?? '')) {
      this.logger.warn(`creditPendingTransactionDeposit: transaction ${reference} status=${transaction.status} is not eligible for credit`);
      return false;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet: any = transaction.receiver_wallet_id
        ? await tx.wallets.findUnique({ where: { id: transaction.receiver_wallet_id } })
        : null;

      const metadata = transaction.metadata as any;
      const userId = metadata?.user_id;
      if (!wallet && userId) {
        wallet = await tx.wallets.findFirst({ where: { user_id: userId, is_active: true } });
      }

      if (!wallet && userId) {
        wallet = await tx.wallets.create({
          data: {
            user_id: userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: transaction.currency || 'FARM',
          },
        });
      }

      if (!wallet) return { ok: false };

      const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
      const amount = this.normalizeAmount(resolveDepositCreditAmount(transaction));

      const updated = await tx.transactions.updateMany({
        where: { id: transaction.id, status: { not: 'completed' } },
        data: {
          status: 'completed',
          receiver_wallet_id: wallet.id,
          processed_at: new Date(),
        },
      });
      if (updated.count === 0) return { ok: false };

      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount,
          balance_before: previousBalance,
          balance_after: previousBalance + amount,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      return { ok: true };
    });

    if (result.ok) {
      const metadata = (transaction?.metadata as any) ?? {};
      await this.invalidateFinancialCaches(metadata?.user_id ?? undefined);
      if (metadata?.user_id) {
        await this.notificationsService.sendNotification(metadata.user_id, {
          type: 'deposit_completed',
          title: 'Deposit completed',
          body: `Your deposit of ${Number(transaction.amount ?? 0)} ${transaction.currency || 'FARM'} has been credited to your wallet.`,
          entityId: transaction.id,
          metadata: { reference, amount: Number(transaction.amount ?? 0), currency: transaction.currency || 'FARM' },
        });
      }
    }

    return result.ok;
  }

  private async creditPendingDepositWithWallet(reference: string, deposit: any, transaction?: any) {
    if (!deposit || deposit.status !== 'PENDING') {
      this.logger.warn(`creditPendingDepositWithWallet: deposit not in PENDING state for ${reference}`);
      return false;
    }

    if (!transaction) {
      transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    }

    if (!transaction || transaction.status?.toLowerCase() !== 'pending') {
      this.logger.warn(
        `creditPendingDepositWithWallet: invalid transaction state for ${reference}. ` +
        `Transaction: ${transaction ? `exists, status=${transaction.status}` : 'missing'}`,
      );
      return false;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.deposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'SUCCESS' },
      });
      if (updated.count === 0) return { ok: false };

      let wallet = await tx.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
      if (!wallet) {
        wallet = await tx.wallets.create({
          data: {
            user_id: deposit.userId,
            wallet_name: 'Main Wallet',
            wallet_type: 'user',
            wallet_address: uuidv4(),
            currency: deposit.currency || 'FARM',
          },
        });
      }

      const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
      const amount = this.normalizeAmount(resolveDepositCreditAmount(transaction, deposit));

      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount,
          balance_before: previousBalance,
          balance_after: previousBalance + amount,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      if (transaction.status?.toLowerCase() !== 'completed') {
        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            receiver_wallet_id: wallet.id,
            processed_at: new Date(),
          },
        });
      }

      return { ok: true };
    });

    if (result.ok) {
      await this.invalidateFinancialCaches(deposit?.userId);
      if (deposit?.userId) {
        await this.notificationsService.sendNotification(deposit.userId, {
          type: 'deposit_completed',
          title: 'Deposit completed',
          body: `Your deposit of ${Number(deposit.amount ?? 0)} ${deposit.currency || 'FARM'} has been credited to your wallet.`,
          entityId: deposit.id,
          metadata: { amount: Number(deposit.amount ?? 0), currency: deposit.currency || 'FARM' },
        });
      }
    }

    return result.ok;
  }

  private async invalidateFinancialCaches(userId?: string) {
    if (!userId) return;

    await Promise.all([
      this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`),
      this.cache.cacheInvalidatePattern(`dashboard:${userId}`),
      this.cache.cacheInvalidatePattern(`transactions:${userId}:*`),
      this.cache.cacheInvalidatePattern(`deposits:${userId}`),
      this.cache.cacheInvalidatePattern(`withdrawals:${userId}`),
      this.cache.cacheInvalidatePattern('deposit:*'),
      this.cache.cacheDelete('admin:dashboard:stats'),
      this.cache.cacheDelete('admin:analytics'),
      this.cache.cacheDelete('admin:superadmin-dashboard'),
    ]);
  }

  private normalizeAmount(amount: any): number {
    const n = Number(amount ?? 0);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }
}
