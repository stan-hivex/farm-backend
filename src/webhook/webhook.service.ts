import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { DepositService } from '../deposit/deposit.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import type { Redis } from 'ioredis';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositService: DepositService,
    private readonly websocket: WebsocketGateway,
    private readonly cfg: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // =========================
  // PAYSTACK WEBHOOK
  // =========================
  async handlePaystackWebhook(payload: any) {
    const event = payload?.event;
    const reference = payload?.data?.reference;

    if (!reference) {
      this.logger.warn('Paystack webhook missing reference');
      return { received: true };
    }

    if (event === 'charge.success') {
      return this.finalizeDeposit(reference);
    }

    return { received: true };
  }

  // =========================
  // IVORYPAY WEBHOOK
  // =========================
  async handleIvorypayWebhook(payload: any) {
    const event = payload?.event || payload?.status;
    const reference = payload?.reference || payload?.data?.reference;

    if (!reference) {
      this.logger.warn('Ivorypay webhook missing reference');
      return { received: true };
    }

    if (['payment.success', 'success', 'transaction.completed'].includes(event)) {
      return this.finalizeDeposit(reference);
    }

    return { received: true };
  }

  // =========================
  // CORE DEPOSIT FINALIZER
  // =========================
  private async finalizeDeposit(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { reference },
    });

    if (!deposit) {
      this.logger.warn(`Deposit not found for ref ${reference}`);
      return false;
    }

    if (deposit.status === 'SUCCESS') {
      return false;
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: {
        user_id: deposit.userId,
        is_active: true,
      },
    });

    if (!wallet) {
      this.logger.warn(`Wallet not found for user ${deposit.userId}`);
      return false;
    }

    const prevBalance = Number(wallet.balance ?? 0);
    const amount = Number(deposit.amount);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update deposit
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'SUCCESS' },
      });

      // 2. Update wallet
      await tx.wallets.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: amount },
        },
      });

      // 3. Ledger entry
      await tx.ledger_entries.create({
        data: {
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount,
          balance_before: prevBalance,
          balance_after: prevBalance + amount,
          description: `Deposit completed: ${reference}`,
        },
      });
    });

    // 4. Emit realtime updates
    this.websocket.emitBalanceUpdate(
      deposit.userId,
      prevBalance + amount,
    );

    this.websocket.emitTransactionUpdate(deposit.userId, {
      reference,
      status: 'SUCCESS',
    });

    this.logger.log(`Deposit completed: ${reference}`);

    return true;
  }
}