import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { DepositService } from '../deposit/deposit.service';
import { WithdrawService } from '../withdraw/withdraw.service';
import { v4 as uuidv4 } from 'uuid';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import type { Redis } from 'ioredis';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositService: DepositService,
    private readonly withdrawService: WithdrawService,
    private readonly websocket: WebsocketGateway,
    private readonly cfg: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async handlePaystackWebhook(payload: any, verified = false) {
    const event = payload.event;
    const eventId = this.getEventId('paystack', payload);
    if (eventId && (await this.isReplay('paystack', eventId))) {
      this.logger.warn(`Replay detected for paystack:${eventId}`);
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Replay detected');
      return { received: true };
    }
    // If the original HTTP request was not signature-verified but a webhook secret
    // exists for the provider, treat this as a strict failure and alert administrators.
    const paystackSecret = this.cfg.get<string>('PAYSTACK_WEBHOOK_SECRET');
    if (!verified && paystackSecret) {
      await this.fallbackAlert('paystack', 'Queued webhook processed without request-time signature verification', payload);
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Missing signature verification during processing');
      return { received: true };
    }

    if (!this.verifyProviderPayload('paystack', payload)) {
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Invalid Paystack payload');
      return { received: true };
    }

    // Strict routing: Paystack webhooks should not be routed for crypto payment_method
    if (payload.payment_method === 'crypto') {
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Paystack webhook routed to wrong provider (crypto)');
      return { received: true };
    }

    if (this.detectPotentialFraud('paystack', payload)) {
      await this.rejectWebhook('paystack', event ?? 'unknown', payload, 'Suspected fraud on Paystack payload');
      return { received: true };
    }

    const log = await this.logWebhook('paystack', event, payload);
    const reference = payload.data?.reference;
    if (!reference) {
      this.logger.warn('Paystack webhook received without a reference');
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Missing reference' } });
      return { received: true };
    }

    if (event === 'charge.success') {
      await this.finalizeDeposit(reference);
    } else if (['transfer.success', 'payout.success', 'transfer.completed'].includes(event)) {
      await this.finalizeWithdrawal(reference, true);
    } else if (['transfer.failed', 'payout.failed', 'charge.failed'].includes(event)) {
      await this.finalizeWithdrawal(reference, false, payload.data?.reason || payload.message);
    }

    if (eventId) await this.markProcessed('paystack', eventId);

    await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'processed' } });
    return { received: true };
  }

  async handleIvorypayWebhook(payload: any, verified = false) {
    const event = payload.event ?? payload.status;
    const eventId = this.getEventId('ivorypay', payload);
    if (eventId && (await this.isReplay('ivorypay', eventId))) {
      this.logger.warn(`Replay detected for ivorypay:${eventId}`);
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Replay detected');
      return { received: true };
    }
    const ivorySecret = this.cfg.get<string>('IVORYPAY_WEBHOOK_SECRET');
    if (!verified && ivorySecret) {
      await this.fallbackAlert('ivorypay', 'Queued webhook processed without request-time signature verification', payload);
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Missing signature verification during processing');
      return { received: true };
    }

    if (!this.verifyProviderPayload('ivorypay', payload)) {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Invalid Ivorypay payload');
      return { received: true };
    }

    // Strict routing: Ivorypay webhooks must be for crypto channel
    if (payload.channel !== 'crypto') {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Ivorypay webhook routed to wrong provider (non-crypto)');
      return { received: true };
    }

    if (this.detectPotentialFraud('ivorypay', payload)) {
      await this.rejectWebhook('ivorypay', event ?? 'unknown', payload, 'Suspected fraud on Ivorypay payload');
      return { received: true };
    }

    const log = await this.logWebhook('ivorypay', event, payload);
    const reference = payload.data?.reference ?? payload.reference;
    if (!reference) {
      this.logger.warn('Ivorypay webhook received without a reference');
      await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'rejected', response: 'Missing reference' } });
      return { received: true };
    }

    if (['payment.success', 'transaction.completed', 'success'].includes(event)) {
      await this.finalizeDeposit(reference);
    } else if (['withdrawal.success', 'transfer.success', 'payout.success'].includes(event)) {
      await this.finalizeWithdrawal(reference, true);
    } else if (['payment.failed', 'transaction.failed', 'withdrawal.failed', 'failed'].includes(event)) {
      await this.finalizeWithdrawal(reference, false, payload.data?.reason || payload.message);
    }

    if (eventId) await this.markProcessed('ivorypay', eventId);

    await this.prisma.webhook_logs.update({ where: { id: log.id }, data: { status: 'processed' } });
    return { received: true };
  }

  private async logWebhook(provider: string, event: string, payload: any, status = 'received', response?: string) {
    return this.prisma.webhook_logs.create({
      data: {
        provider,
        event_name: event,
        payload,
        status,
        response,
      },
    });
  }

  private async rejectWebhook(provider: string, event: string, payload: any, reason: string) {
    this.logger.warn(`Rejecting webhook from ${provider}: ${reason}`);
    return this.logWebhook(provider, event, payload, 'rejected', reason);
  }

  private verifyProviderPayload(provider: string, payload: any) {
    if (provider === 'paystack') {
      // Require expected Paystack fields: event, data.reference and numeric amount
      const hasEvent = !!payload?.event;
      const hasRef = !!payload?.data?.reference && typeof payload.data.reference === 'string';
      const amount = payload?.data?.amount ?? payload?.amount;
      const hasAmount = amount !== undefined && amount !== null && !isNaN(Number(amount));
      return hasEvent && hasRef && hasAmount;
    }

    if (provider === 'ivorypay') {
      // Ivorypay: prefer top-level reference or data.reference and some status/event
      const hasRef = !!payload?.reference || !!payload?.data?.reference;
      const hasEvent = !!payload?.event || !!payload?.status;
      return hasRef && hasEvent;
    }

    return false;
  }

  private async fallbackAlert(provider: string, reason: string, payload: any) {
    try {
      this.logger.error(`Fallback alert for ${provider}: ${reason}`);
      // Record an unverified webhook log for operator review
      await this.logWebhook(provider, 'unknown', payload, 'unverified', reason);

      // Emit a server-level security alert for any connected admin consoles
      try {
        this.websocket.server?.emit('security:alert', { provider, reason, timestamp: new Date().toISOString() });
      } catch (e) {
        this.logger.debug('Failed to emit websocket security alert', e as any);
      }
    } catch (e) {
      this.logger.error('Failed to create fallback alert', e as any);
    }
  }

  private getEventId(provider: string, payload: any) {
    return (
      payload.id ?? payload.data?.id ?? payload.data?.reference ?? payload.reference ?? null
    );
  }

  private async isReplay(provider: string, eventId: string) {
    try {
      const key = `${this.cfg.get<string>('WEBHOOK_DEDUP_PREFIX', 'webhook:processed:')}${provider}:${eventId}`;
      const v = await this.redis.get(key);
      return !!v;
    } catch (e) {
      this.logger.error('Failed to access Redis for webhook replay check', e as any);
      return false;
    }
  }

  private async markProcessed(provider: string, eventId: string) {
    try {
      const key = `${this.cfg.get<string>('WEBHOOK_DEDUP_PREFIX', 'webhook:processed:')}${provider}:${eventId}`;
      const ttl = Number(this.cfg.get<number>('WEBHOOK_DEDUP_TTL_MS', 0));
      if (ttl > 0) {
        await this.redis.set(key, '1', 'PX', ttl, 'NX');
      } else {
        await this.redis.set(key, '1', 'NX');
      }
    } catch (e) {
      this.logger.error('Failed to mark webhook processed in Redis', e as any);
    }
  }

  private detectPotentialFraud(provider: string, payload: any) {
    const amount = this.normalizeAmount(payload?.data?.amount ?? payload?.amount ?? 0);
    const maxAmount = Number(this.cfg.get<number>('FRAUD_MAX_WEBHOOK_AMOUNT', 5000000));
    if (amount > maxAmount) {
      this.logger.warn(`Potential fraud detected: ${provider} amount ${amount} exceeds threshold ${maxAmount}`);
      return true;
    }

    if (provider === 'paystack' && payload?.data?.status && payload.data.status !== 'success' && payload.event === 'charge.success') {
      this.logger.warn('Paystack webhook contains inconsistent status for charge.success');
      return true;
    }

    return false;
  }

  private async finalizeDeposit(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    const depositPending = !!deposit && deposit.status === 'PENDING';
    const depositComplete = !!deposit && deposit.status === 'SUCCESS';
    const txPending = !!transaction && transaction.transaction_type === 'deposit' && transaction.status !== 'completed';
    const txComplete = !!transaction && transaction.transaction_type === 'deposit' && transaction.status === 'completed';

    if (depositComplete && txComplete) {
      return true;
    }

    if (depositPending) {
      const depositHandled = await this.depositService.markDepositSuccessful(reference);
      if (!depositHandled) return false;
      if (txPending) {
        await this.completePendingTransaction(reference, transaction); // keep transaction in sync after deposit completion
      }
      return true;
    }

    if (depositComplete && txPending) {
      await this.completePendingTransaction(reference, transaction);
      return true;
    }

    if (txPending) {
      return this.creditPendingTransactionDeposit(reference);
    }

    return depositComplete || txComplete;
  }

  private async completePendingTransaction(reference: string, transaction?: any) {
    if (!transaction) {
      transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    }
    if (!transaction || transaction.transaction_type !== 'deposit' || transaction.status === 'completed') {
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

    return true;
  }

  private async creditPendingTransactionDeposit(reference: string) {
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
    if (!transaction || transaction.transaction_type !== 'deposit') return false;
    if (transaction.status === 'completed') return true;

    const result = await this.prisma.$transaction(async (tx) => {
      let wallet: any = null;
      if (transaction.receiver_wallet_id) {
        wallet = await tx.wallets.findUnique({ where: { id: transaction.receiver_wallet_id } });
      }

      const meta = transaction.metadata as any;
      const userId = meta?.user_id;
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

      const prev = this.normalizeAmount(Number(wallet.balance ?? 0));
      const amt = this.normalizeAmount(Number(transaction.amount));

      const updated = await tx.transactions.updateMany({
        where: { id: transaction.id, status: { not: 'completed' } },
        data: {
          status: 'completed',
          receiver_wallet_id: wallet.id,
          processed_at: new Date(),
        },
      });

      if (updated.count === 0) return { ok: false };

      await tx.wallets.update({ where: { id: wallet.id }, data: { balance: { increment: amt } } });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: amt,
          balance_before: prev,
          balance_after: prev + amt,
          description: `Deposit completed — ref: ${reference}`,
        },
      });

      return { ok: true, wallet, previousBalance: prev, amount: amt };
    });

    if (!result || !result.ok) return false;

    const wallet = (result as any).wallet;
    const previousBalance = (result as any).previousBalance;
    const amount = (result as any).amount;

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', previousBalance + amount);
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', { reference, status: 'SUCCESS' });

    return true;
  }

  private async finalizeWithdrawal(reference: string, success: boolean, reason?: string) {
    const handledByWithdrawService = success
      ? await this.withdrawService.approveWithdrawal(reference)
      : await this.withdrawService.rejectWithdrawal(reference, reason || 'Withdrawal failed');

    if (handledByWithdrawService) {
      await this.emitWithdrawalUpdate(reference, success ? 'SUCCESS' : 'FAILED');
      return true;
    }

    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
    });
    if (!transaction || transaction.transaction_type !== 'withdrawal') {
      return false;
    }

    if (success) {
      return this.completeTransactionWithdrawal(transaction);
    }

    return this.failTransactionWithdrawal(transaction, reason);
  }

  private async completeTransactionWithdrawal(transaction: any) {
    if (transaction.status === 'completed') {
      return false;
    }

    const wallet = await this.prisma.wallets.findUnique({
      where: { id: transaction.sender_wallet_id },
    });
    if (!wallet) {
      return false;
    }

    const previousBalance = Number(wallet.balance ?? 0);
    const previousLocked = Number(wallet.locked_balance ?? 0);
    const withdrawAmount = Number(transaction.amount);

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
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'debit',
          amount: withdrawAmount,
          balance_before: previousBalance,
          balance_after: previousBalance - withdrawAmount,
          description: `Withdrawal completed — ref: ${transaction.transaction_reference}`,
        },
      });

      await tx.transactions.update({
        where: { id: transaction.id },
        data: { status: 'completed', processed_at: new Date() },
      });
    });

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', previousBalance - withdrawAmount);
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference: transaction.transaction_reference,
      status: 'SUCCESS',
    });

    return true;
  }

  private async failTransactionWithdrawal(transaction: any, reason?: string) {
    if (transaction.status === 'failed') {
      return false;
    }

    const wallet = await this.prisma.wallets.findUnique({
      where: { id: transaction.sender_wallet_id },
    });
    if (!wallet) {
      return false;
    }

    const previousLocked = Number(wallet.locked_balance ?? 0);
    const unlockAmount = Math.min(previousLocked, Number(transaction.amount ?? 0));

    await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { locked_balance: { decrement: unlockAmount } },
      });

      await tx.transactions.update({
        where: { id: transaction.id },
        data: { status: 'failed', processed_at: new Date() },
      });
    });

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', Number(wallet.balance ?? 0));
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference: transaction.transaction_reference,
      status: 'FAILED',
    });

    return true;
  }

  private async emitWithdrawalUpdate(reference: string, status: string) {
    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { reference },
    });
    if (!withdrawal) {
      return;
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: withdrawal.userId, is_active: true },
    });
    if (!wallet) {
      return;
    }

    this.websocket.emitBalanceUpdate(wallet.user_id ?? '', Number(wallet.balance ?? 0));
    this.websocket.emitTransactionUpdate(wallet.user_id ?? '', {
      reference,
      status,
    });
  }

  private normalizeAmount(amount: any): number {
    const n = Number(amount ?? 0);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }
}
