import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, query: any) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = { OR: [{ sender_wallet_id: wallet.id }, { receiver_wallet_id: wallet.id }] };
    if (query.type) where.transaction_type = query.type;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.transactions.findMany({ where, skip, take, orderBy: { created_at: 'desc' } }),
      this.prisma.transactions.count({ where }),
    ]);
    return {
      data: items.map((t) => ({
        ...t,
        amount: Number(t.amount),
        fee: Number(t.fee),
        net_amount: Number(t.net_amount),
        is_outgoing: t.sender_wallet_id === wallet.id,
      })),
      meta: paginate(total, page, limit),
    };
  }

  async findOne(userId: string, txId: string) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const txn = await this.prisma.transactions.findFirst({
      where: {
        id: txId,
        OR: [{ sender_wallet_id: wallet?.id }, { receiver_wallet_id: wallet?.id }],
      },
      include: { ledger_entries: true },
    });
    if (!txn) throw new NotFoundException('Transaction not found');
    return {
      data: {
        ...txn,
        amount: Number(txn.amount),
        fee: Number(txn.fee),
        net_amount: Number(txn.net_amount),
        is_outgoing: txn.sender_wallet_id === wallet?.id,
      },
    };
  }
}