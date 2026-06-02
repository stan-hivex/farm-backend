import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly websocket: WebsocketGateway,
    private readonly cfg: ConfigService,
  ) {}

  // ===============================
  // PAYSTACK WEBHOOK ENTRY
  // ===============================
  async handlePaystackWebhook(payload: any) {
    const event = payload.event;
    const reference = payload?.data?.reference;

    if (!reference) {
      this.logger.warn('Missing reference in Paystack webhook');
      return { received: true };
    }

    if (event === 'charge.success') {
      await this.finalizeDeposit(reference);
    }

    return { received: true };
  }

  // ===============================
  // IVORYPAY WEBHOOK ENTRY
  // ===============================
  async handleIvorypayWebhook(payload: any) {
    const event = payload.event || payload.status;
    const reference = payload?.data?.reference || payload?.reference;

    if (!reference) return { received: true };

    if (['payment.success', 'success', 'transaction.completed'].includes(event)) {
      await this.finalizeDeposit(reference);
    }

    return { received: true };
  }

  // ===============================
  // CORE DEPOSIT FINALIZER
  // ===============================
  private async finalizeDeposit(reference: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { reference },
    });

    if (!deposit || deposit.status !== 'PENDING') return false;

    const wallet = await this.prisma.wallets.findFirst({
      where: {
        user_id: deposit.userId,
        is_active: true,
      },
    });

    if (!wallet) return false;

    const prevBalance = Number(wallet.balance ?? 0);
    const amount = Number(deposit.amount);

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark deposit SUCCESS
      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: 'SUCCESS' },
      });

      // 2. Update wallet balance
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
          description: `Deposit successful — ref ${reference}`,
        },
      });
    });

    // ===============================
    // REALTIME UPDATES
    // ===============================
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