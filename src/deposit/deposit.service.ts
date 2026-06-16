// src/deposit/deposit.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private ivorypay: IvorypayService,
  ) {}

  async createDeposit(userId: string, dto: any) {
    const amount = Number(dto.amount_fiat);
    if (!Number.isFinite(amount) || amount < 10) {
      throw new BadRequestException('Invalid deposit amount. Minimum deposit is KES 10');
    }

    const reference = uuidv4();
    const paymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
    const provider = paymentMethod === 'CRYPTO' ? 'ivorypay' : 'paystack';
    const feeRate = paymentMethod === 'MOBILE_MONEY' ? 0.015 : 0.02;
    const fee = amount * feeRate;
    const total = amount + fee;

    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount,
        fee,
        total,
        currency: dto.currency || 'KES',
        paymentMethod,
        provider,
        reference,
        status: 'PENDING',
        providerRef: reference,
      },
    });

    let paymentUrl: string | null = null;

    if (paymentMethod === 'CRYPTO') {
      const init = await this.ivorypay.createPayment({
        amount: total,
        currency: 'KES',
        reference,
        email: dto.email || `${userId}@farm.app`,
        description: `Farm deposit ${total} KES via crypto`,
      });
      paymentUrl = init.data?.payment_link || init.payment_link || init.checkout_url;
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
      // Card deposits should not use mobile-money Paystack flow; leave card handling
      // to the client or a separate card-specific integration.
      paymentUrl = null;
    } else {
      throw new BadRequestException(`Unsupported payment method ${paymentMethod}`);
    }

    return {
      success: true,
      payment_url: paymentUrl,
      authorization_url: paymentUrl,
      reference,
      deposit,
    };
  }

  async getUserDeposits(userId: string) {
    return this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWalletBalance(userId: string) {
    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    return { balance: wallet?.balance ?? 0, locked_balance: wallet?.locked_balance ?? 0 };
  }

  async getDepositById(id: string) {
    return this.prisma.deposit.findUnique({ where: { id } });
  }

  // Called ONLY from webhook
  async finalizeSuccessfulDeposit(reference: string) {
    this.logger.log(`finalizeSuccessfulDeposit: start for reference=${reference}`);
    let deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    if (!transaction) {
      throw new BadRequestException(`Transaction not found for reference: ${reference}`);
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
    const txPending = isDeposit && transaction.status?.toLowerCase() !== 'completed';
    const txComplete = isDeposit && transaction.status?.toLowerCase() === 'completed';

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

    if (transaction.status?.toLowerCase() !== 'completed') {
      return this.creditPendingTransactionDeposit(reference);
    }

    return depositComplete || txComplete;
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

      const amount = this.normalizeAmount(Number(deposit.amount));
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

    return result.ok;
  }

  private async completePendingTransaction(reference: string, transaction: any) {
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    if (transaction.status?.toLowerCase() === 'completed') {
      return true;
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
    if (!transaction) {
      this.logger.warn(`Transaction not found for reference: ${reference}`);
      return false;
    }

    const isDeposit = transaction.transaction_type?.toLowerCase() === 'deposit';
    if (!isDeposit) return false;
    if (transaction.status?.toLowerCase() === 'completed') return true;

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
      const amount = this.normalizeAmount(Number(transaction.amount));

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
      const amount = this.normalizeAmount(Number(deposit.amount));

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

    return result.ok;
  }

  private normalizeAmount(amount: any): number {
    const n = Number(amount ?? 0);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }
}
