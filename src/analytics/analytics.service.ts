import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getPlatformStats(period: 'day' | 'week' | 'month' = 'month') {
    const from = new Date();
    if (period === 'day') from.setDate(from.getDate() - 1);
    else if (period === 'week') from.setDate(from.getDate() - 7);
    else from.setMonth(from.getMonth() - 1);

    const [txVolume, newUsers, activeEscrows, merchantPayments] = await Promise.all([
      this.prisma.transactions.aggregate({
        where: { status: 'completed', created_at: { gte: from } },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.users.count({ where: { created_at: { gte: from }, is_deleted: false } }),
      this.prisma.escrow_contracts.count({ where: { status: { in: ['active', 'disputed'] } } }),
      this.prisma.transactions.aggregate({
        where: { transaction_type: 'merchant_payment', status: 'completed', created_at: { gte: from } },
        _sum: { amount: true }, _count: true,
      }),
    ]);

    return {
      data: {
        period,
        transaction_volume: Number(txVolume._sum.amount || 0),
        transaction_count: txVolume._count,
        new_users: newUsers,
        active_escrows: activeEscrows,
        merchant_payment_volume: Number(merchantPayments._sum.amount || 0),
        merchant_payment_count: merchantPayments._count,
      },
    };
  }

  async getTransactionVolume(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const txns = await this.prisma.transactions.findMany({
      where: { status: 'completed', created_at: { gte: from } },
      select: { created_at: true, amount: true, transaction_type: true },
      orderBy: { created_at: 'asc' },
    });
    const byDay: Record<string, { date: string; total: number; count: number }> = {};
    for (const t of txns) {
      const day = t.created_at!.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, total: 0, count: 0 };
      byDay[day].total += Number(t.amount);
      byDay[day].count++;
    }
    return { data: Object.values(byDay) };
  }
  async getUserGrowthHistory(
userId: string,
days = 7,
) {
const from = new Date();
from.setDate(from.getDate() - days);

// Get user's wallets first
const userWallets = await this.prisma.wallets.findMany({
where: { user_id: userId },
select: { id: true },
});

const walletIds = userWallets.map(w => w.id);

// Get transactions where user is sender or receiver
const transactions =
await this.prisma.transactions.findMany({
where: {
OR: [
{ sender_wallet_id: { in: walletIds } },
{ receiver_wallet_id: { in: walletIds } },
],
status: 'completed',
created_at: {
gte: from,
},
},
select: {
amount: true,
created_at: true,
},
orderBy: {
created_at: 'asc',
},
});

const grouped: Record<
string,
{ date: string; total: number }

> = {};

for (const tx of transactions) {
const day =
tx.created_at!.toISOString().slice(0, 10);

if (!grouped[day]) {
  grouped[day] = {
    date: day,
    total: 0,
  };
}

grouped[day].total += Number(tx.amount);


}

return {
data: Object.values(grouped),
};
}

}