import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { generateTxReference } from '../common/utils/reference.util';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(private prisma: PrismaService, private authService: AuthService) {}

  async getMyWallet(userId: string) {
    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const available = Number(wallet.balance) - Number(wallet.locked_balance);
    return {
      data: {
        id: wallet.id,
        wallet_address: wallet.wallet_address,
        wallet_type: wallet.wallet_type,
        balance: Number(wallet.balance),
        locked_balance: Number(wallet.locked_balance),
        available_balance: Math.max(0, available),
        currency: wallet.currency,
        blockchain_address: wallet.blockchain_address,
        is_frozen: wallet.is_frozen,
      },
    };
  }

  async sendFunds(
    senderId: string,
    dto: { recipient_identifier: string; amount: number; pin: string; description?: string },
    ip: string,
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be greater than zero');
    await this.authService.verifyPin(senderId, dto.pin);

    return this.prisma.$transaction(async (tx) => {
      const senderWallet = await tx.wallets.findFirst({
        where: { user_id: senderId, is_active: true },
      });
      if (!senderWallet) throw new NotFoundException('Sender wallet not found');
      if (senderWallet.is_frozen) throw new ForbiddenException('Your wallet is frozen. Contact support.');

      // Single transfer ceiling
      const MAX_SINGLE_TX = 100_000; // FARM
      if (dto.amount > MAX_SINGLE_TX) {
        throw new BadRequestException(`Single transfer limit is ${MAX_SINGLE_TX} FARM`);
      }

      // Daily velocity check
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const dailyVolume = await tx.transactions.aggregate({
        where: {
          sender_wallet_id: senderWallet.id,
          transaction_type: 'transfer',
          status: 'completed',
          created_at: { gte: todayStart },
        },
        _sum: { amount: true },
      });

      const MAX_DAILY = 500_000; // FARM
      const sentToday = Number(dailyVolume._sum.amount ?? 0);
      if (sentToday + dto.amount > MAX_DAILY) {
        throw new BadRequestException('Daily transfer limit exceeded');
      }

      const receiverUser = await tx.users.findFirst({
        where: {
          OR: [{ username: dto.recipient_identifier }, { phone: dto.recipient_identifier }],
          is_deleted: false,
          is_active: true,
        },
        include: { wallets: { where: { is_active: true }, take: 1 } },
      });

      let receiverWalletId: string;
      if (receiverUser?.wallets[0]) {
        receiverWalletId = receiverUser.wallets[0].id;
      } else {
        const byAddress = await tx.wallets.findUnique({
          where: { wallet_address: dto.recipient_identifier },
        });
        if (!byAddress) throw new NotFoundException('Recipient not found');
        receiverWalletId = byAddress.id;
      }

      if (senderWallet.id === receiverWalletId)
        throw new BadRequestException('Cannot send to yourself');

      const feeCfg = await tx.fee_configurations.findFirst({
        where: { transaction_type: 'transfer', is_active: true },
      });
      const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
      const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
      let fee = dto.amount * pctFee + flatFee;
      if (feeCfg)
        fee = Math.max(
          Number(feeCfg.minimum_fee),
          Math.min(Number(feeCfg.maximum_fee ?? 999999), fee),
        );
      const totalOut = dto.amount + fee;

      const available = Number(senderWallet.balance) - Number(senderWallet.locked_balance);
      if (available < totalOut)
        throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);

      const reference = generateTxReference();
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: reference,
          sender_wallet_id: senderWallet.id,
          receiver_wallet_id: receiverWalletId,
          transaction_type: 'transfer',
          status: 'processing',
          amount: dto.amount,
          fee,
          net_amount: dto.amount - fee,
          currency: 'FARM',
          description: dto.description || `Transfer to ${dto.recipient_identifier}`,
          ip_address: ip,
          metadata: { user_id: senderId },
        },
      });

      const recvWallet = await tx.wallets.findUnique({ where: { id: receiverWalletId } });

      await tx.wallets.update({
        where: { id: senderWallet.id },
        data: { balance: { decrement: totalOut } },
      });
      await tx.wallets.update({
        where: { id: receiverWalletId },
        data: { balance: { increment: dto.amount } },
      });

      await tx.ledger_entries.createMany({
        data: [
          {
            transaction_id: txn.id,
            wallet_id: senderWallet.id,
            entry_type: 'debit',
            amount: totalOut,
            balance_before: Number(senderWallet.balance),
            balance_after: Number(senderWallet.balance) - totalOut,
            description: `Transfer to ${dto.recipient_identifier}`,
          },
          {
            transaction_id: txn.id,
            wallet_id: receiverWalletId,
            entry_type: 'credit',
            amount: dto.amount,
            balance_before: Number(recvWallet!.balance),
            balance_after: Number(recvWallet!.balance) + dto.amount,
            description: 'Transfer received',
          },
        ],
      });

      await tx.transactions.update({
        where: { id: txn.id },
        data: { status: 'completed', processed_at: new Date() },
      });

      return {
        data: { transaction_reference: reference, amount: dto.amount, fee, status: 'completed' },
        message: 'Transfer successful',
      };
    });
  }

  async getTransactions(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const where: any = { OR: [{ sender_wallet_id: wallet.id }, { receiver_wallet_id: wallet.id }] };
    if (query.type) where.transaction_type = query.type;
    if (query.status) where.status = query.status;

    const [txns, total] = await Promise.all([
      this.prisma.transactions.findMany({ where, skip, take, orderBy: { created_at: 'desc' } }),
      this.prisma.transactions.count({ where }),
    ]);
    return {
      data: txns.map((t) => ({
        ...t,
        amount: Number(t.amount),
        fee: Number(t.fee),
        net_amount: Number(t.net_amount),
        is_outgoing: t.sender_wallet_id === wallet.id,
      })),
      meta: paginate(total, page, limit),
    };
  }
}