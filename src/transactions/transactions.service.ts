import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

export interface TransactionUserSummary {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  profile_image?: string | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async findAll(userId: string, query: any) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = { OR: [{ sender_wallet_id: wallet.id }, { receiver_wallet_id: wallet.id }] };
    if (query.type) where.transaction_type = query.type;
    if (query.status) where.status = query.status;
    const cacheKey = `transactions:${userId}:${page}:${limit}`;
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const [items, total] = await Promise.all([
      this.prisma.transactions.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          wallets_transactions_sender_wallet_idTowallets: {
            select: {
              id: true,
              user_id: true,
              users: {
                select: {
                  id: true,
                  username: true,
                  first_name: true,
                  last_name: true,
                  profile_image: true,
                },
              },
            },
          },
          wallets_transactions_receiver_wallet_idTowallets: {
            select: {
              id: true,
              user_id: true,
              users: {
                select: {
                  id: true,
                  username: true,
                  first_name: true,
                  last_name: true,
                  profile_image: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.transactions.count({ where }),
    ]);

    const merchantIds = [
      ...new Set(
        items
          .map((t: any) => {
            const metadata = t.metadata;
            if (metadata && typeof metadata === 'object') {
              return (metadata as any).merchant_id || (metadata as any).merchantId;
            }
            return null;
          })
          .filter((id: any) => id != null),
      ),
    ];

    const merchantMap: Record<string, string> = {};
    if (merchantIds.length > 0) {
      const merchants = await this.prisma.merchants.findMany({
        where: { id: { in: merchantIds } },
        select: { id: true, business_name: true },
      });
      merchants.forEach((m) => {
        if (m.id && m.business_name) merchantMap[m.id] = m.business_name;
      });
    }

    const payload = {
      data: items.map((t) => {
        const normalizedStatus = this.normalizeTransactionStatus(t.status, t.transaction_type);
        const normalizedDescription = this.normalizeTransactionDescription(
          t.transaction_type,
          normalizedStatus,
          t.description,
        );

        const senderUser = this.buildUserSummary(
          t.wallets_transactions_sender_wallet_idTowallets?.users,
        );
        const recipientUser = this.buildUserSummary(
          t.wallets_transactions_receiver_wallet_idTowallets?.users,
        );

        let merchantBusinessName = '';
        if (t.metadata && typeof t.metadata === 'object') {
          const merchantId = (t.metadata as any).merchant_id || (t.metadata as any).merchantId;
          if (merchantId) merchantBusinessName = merchantMap[merchantId] || '';
        }

        return {
          ...t,
          status: normalizedStatus,
          description: normalizedDescription,
          amount: Number(t.amount),
          fee: Number(t.fee),
          net_amount: Number(t.net_amount),
          is_outgoing: t.sender_wallet_id === wallet.id,
          sender_username: senderUser?.username ?? '',
          recipient_username: recipientUser?.username ?? '',
          sender_user: senderUser,
          recipient_user: recipientUser,
          users_sender: senderUser,
          users_recipient: recipientUser,
          merchant_business_name: merchantBusinessName,
        };
      }),
      meta: paginate(total, page, limit),
    };
    await this.cache.cacheSet(cacheKey, payload, 45);
    return payload;
  }

  async findOne(userId: string, txId: string) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const txn = await this.prisma.transactions.findFirst({
      where: {
        id: txId,
        OR: [{ sender_wallet_id: wallet?.id }, { receiver_wallet_id: wallet?.id }],
      },
      include: {
        ledger_entries: true,
        wallets_transactions_sender_wallet_idTowallets: {
          select: {
            id: true,
            user_id: true,
            users: {
              select: {
                id: true,
                username: true,
                first_name: true,
                last_name: true,
                profile_image: true,
              },
            },
          },
        },
        wallets_transactions_receiver_wallet_idTowallets: {
          select: {
            id: true,
            user_id: true,
            users: {
              select: {
                id: true,
                username: true,
                first_name: true,
                last_name: true,
                profile_image: true,
              },
            },
          },
        },
      },
    });
    if (!txn) throw new NotFoundException('Transaction not found');
    const normalizedStatus = this.normalizeTransactionStatus(txn.status, txn.transaction_type);
    const senderUser = this.buildUserSummary((txn as any).wallets_transactions_sender_wallet_idTowallets?.users);
    const recipientUser = this.buildUserSummary((txn as any).wallets_transactions_receiver_wallet_idTowallets?.users);

    let merchantBusinessName = '';
    if (txn.metadata && typeof txn.metadata === 'object') {
      const merchantId = (txn.metadata as any).merchant_id || (txn.metadata as any).merchantId;
      if (merchantId) {
        const merchant = await this.prisma.merchants.findUnique({
          where: { id: merchantId },
          select: { business_name: true },
        });
        merchantBusinessName = merchant?.business_name || '';
      }
    }

    return {
      data: {
        ...txn,
        status: normalizedStatus,
        description: this.normalizeTransactionDescription(txn.transaction_type, normalizedStatus, txn.description),
        amount: Number(txn.amount),
        fee: Number(txn.fee),
        net_amount: Number(txn.net_amount),
        is_outgoing: txn.sender_wallet_id === wallet?.id,
        sender_username: senderUser?.username ?? '',
        recipient_username: recipientUser?.username ?? '',
        sender_user: senderUser,
        recipient_user: recipientUser,
        users_sender: senderUser,
        users_recipient: recipientUser,
        merchant_business_name: merchantBusinessName,
      },
    };
  }

  private buildUserSummary(user: any): TransactionUserSummary | null {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username ?? '',
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      profile_image: user.profile_image ?? null,
    };
  }

  private normalizeTransactionStatus(status: string | null | undefined, transactionType?: string | null) {
    const normalized = (status ?? '').toString().toLowerCase();
    const successfulStatuses = ['completed', 'success', 'successful', 'succeeded', 'paid', 'settled'];
    const pendingStatuses = ['pending', 'processing', 'initiated', 'in_progress'];
    const failedStatuses = ['failed', 'cancelled', 'reversed', 'declined', 'expired', 'abandoned', 'incomplete'];

    if (successfulStatuses.includes(normalized)) return 'Completed';
    if (pendingStatuses.includes(normalized)) return 'Pending';
    if (failedStatuses.includes(normalized)) return 'Failed';

    if (transactionType?.toLowerCase() === 'deposit' && normalized.includes('success')) return 'Completed';
    if (transactionType?.toLowerCase() === 'withdrawal' && normalized.includes('success')) return 'Completed';
    return status?.toString() ?? 'Pending';
  }

  private normalizeTransactionDescription(transactionType: string | null | undefined, status: string | null | undefined, description: string | null | undefined) {
    const normalizedType = (transactionType ?? '').toString().toLowerCase();
    const normalizedStatus = (status ?? '').toString().toLowerCase();
    if (normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === 'successful') {
      if (normalizedType === 'deposit') return 'Successful deposit';
      if (normalizedType === 'withdrawal') return 'Successful withdrawal';
      return 'Successful transaction';
    }
    if (normalizedStatus === 'pending') {
      if (normalizedType === 'deposit') return 'Pending deposit';
      if (normalizedType === 'withdrawal') return 'Pending withdrawal';
      return 'Pending transaction';
    }
    if (normalizedStatus === 'failed') {
      return 'Failed transaction';
    }
    return description ?? 'Transaction';
  }
}