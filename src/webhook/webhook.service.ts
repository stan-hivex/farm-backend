import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { DepositService } from '../deposit/deposit.service';
import { WithdrawService } from '../withdraw/withdraw.service';
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

  // =========================
  // PAYSTACK WEBHOOK
  // =========================
  async handlePaystackWebhook(payload: any, verified = false) {
    const event = payload?.event;
    const reference = payload?.data?.reference;

    if (!event || !reference) {
      this.logger.warn('Invalid Paystack webhook payload');
      return { received: true };
    }

    if (event !== 'charge.success') {
      return { received: true };
    }

    return this.finalizeDeposit(reference);
  }

  // =========================
  // IVORYPAY WEBHOOK
  // =========================
  async handleIvorypayWebhook(payload: any, verified = false) {
    const event = payload?.event || payload?.status;
    const reference = payload?.reference || payload?.data?.reference;

    if (!reference) {
      this.logger.warn('Invalid Ivorypay webhook payload');
      return { received: true };
    }

    if (['payment.success', 'transaction.completed', 'success'].includes(event)) {
      return this.finalizeDeposit(reference);
    }

    return { received: true };
  }

  // =========================
  // FINALIZE DEPOSIT (CORE LOGIC)
  // =========================
  private async finalizeDeposit(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { reference },
    });

    if (!deposit) {
      this.logger.warn(`Deposit not found for reference: ${reference}`);
      return false;
    }

    if (deposit.status === 'SUCCESS') {
      return true; // prevent double credit
    }

    const wallet = await this.prisma.wallets.findFirst({
      where: {
        user_id: deposit.userId,
        is_active: true,
      },
    });

    if (!wallet) {
      this.logger.error(`Wallet not found for user: ${deposit.userId}`);
      return false;
    }

    const prev = Number(wallet.balance ?? 0);

    await this.prisma.$transaction(async (tx) => {
      // 1. update deposit
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'SUCCESS', processed_at: new Date() },
      });

      // 2. update wallet
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: deposit.amount } },
      });

      // 3. ledger entry
      await tx.ledger_entries.create({
        data: {
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: deposit.amount,
          balance_before: prev,
          balance_after: prev + deposit.amount,
          description: `Deposit successful — ${reference}`,
        },
      });
    });

    // real-time updates
    this.websocket.emitBalanceUpdate(deposit.userId, prev + deposit.amount);
    this.websocket.emitTransactionUpdate(deposit.userId, {
      reference,
      status: 'SUCCESS',
    });

    this.logger.log(`Deposit completed: ${reference}`);

    return true;
  }

  // =========================
  // WITHDRAWAL (SAFE MINIMAL)
  // =========================
  private async finalizeWithdrawal(reference: string, success: boolean) {
    if (success) {
      return this.withdrawService.approveWithdrawal(reference);
    }
    return this.withdrawService.rejectWithdrawal(reference, 'failed');
  }
}