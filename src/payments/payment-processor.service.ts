import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { v4 as uuidv4 } from 'uuid';
import type { Redis } from 'ioredis';

@Injectable()
export class PaymentProcessorService {
  private readonly logger = new Logger(PaymentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly websocket: WebsocketGateway,
    @Inject('REDIS_CLIENT') private readonly redis: Redis | null,
  ) {}

  async processDeposit(reference: string) {
    if (!this.redis) {
      this.logger.warn('Redis client unavailable — skipping idempotency lock');
    }

    const lockKey = `payment:lock:${reference}`;
    try {
      if (this.redis) {
        // use PX with milliseconds to match other usages and satisfy typings
        const locked = await this.redis.set(lockKey, '1', 'PX', 60000, 'NX');
        if (!locked) return; // already processing
      }

      let deposit = await this.prisma.deposit.findUnique({ where: { reference } });

      const transaction = await this.prisma.transactions.findUnique({
        where: { transaction_reference: reference },
      });

      if (!transaction || transaction.status === 'completed') return;

      const metadata = transaction.metadata as any;
      const userId = deposit?.userId || metadata?.user_id;

      if (!userId) throw new Error('Missing userId for deposit');

      const amount = Number(transaction.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Invalid deposit amount for reference ${reference}`);
      }

      const currency = transaction.currency ?? 'FARM';
      const paymentMethod = metadata?.provider?.toString()?.toUpperCase() === 'IVORYPAY' ? 'CRYPTO' : 'CARD';
      const isDepositAlreadySuccessful = deposit?.status === 'SUCCESS';
      const shouldCreditWallet = !isDepositAlreadySuccessful;

      if (!deposit) {
        deposit = await this.prisma.deposit.create({
          data: {
            reference,
            amount,
            fee: 0,
            total: amount,
            currency,
            paymentMethod,
            status: 'SUCCESS',
            userId,
          },
        });
      }

      await this.prisma.$transaction(async (tx) => {
        // 1. ENSURE WALLET
        let wallet = await tx.wallets.findFirst({ where: { user_id: userId, is_active: true } });
        if (!wallet) {
          wallet = await tx.wallets.create({
            data: {
              user_id: userId,
              wallet_name: 'Main Wallet',
              wallet_type: 'user',
              wallet_address: uuidv4(),
              currency,
            },
          });
        }

        const previousBalance = Number(wallet.balance ?? 0);

        if (shouldCreditWallet) {
          await tx.wallets.update({
            where: { id: wallet.id },
            data: { balance: { increment: amount } },
          });
        }

        if (deposit.status !== 'SUCCESS') {
          await tx.deposit.update({
            where: { id: deposit.id },
            data: { status: 'SUCCESS' },
          });
        }

        await tx.transactions.update({
          where: { id: transaction.id },
          data: {
            status: 'completed',
            receiver_wallet_id: wallet.id,
            processed_at: new Date(),
          },
        });

        if (shouldCreditWallet) {
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
        }
      });

      // Emit updates to connected clients
      try {
        const updatedWallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
        this.websocket.emitBalanceUpdate(userId, Number(updatedWallet?.balance ?? 0));
      } catch (e) {
        this.logger.debug('Failed to fetch updated wallet for websocket emit', e as any);
      }
      this.websocket.emitTransactionUpdate(userId, { reference, status: 'SUCCESS' });
    } catch (e) {
      this.logger.error(`Failed to process deposit ${reference}: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      try {
        if (this.redis) await this.redis.del(lockKey);
      } catch (e) {
        this.logger.debug('Failed to release redis lock', e as any);
      }
    }
  }
}
