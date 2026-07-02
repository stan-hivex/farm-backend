import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async getPlatformStats(period: 'day' | 'week' | 'month' = 'month') {
    return this.cacheService.wrap(
      `analytics:platform-stats:${period}`,
      30,
      async () => {
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
      },
    );
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
    period = 'daily',
  ) {
    const normalizedPeriod = period?.toString().trim().toLowerCase() || 'daily';

    const from = new Date();
    if (normalizedPeriod === 'weekly') {
      from.setDate(from.getDate() - 84);
    } else if (normalizedPeriod === 'monthly') {
      from.setFullYear(from.getFullYear() - 1);
    } else if (normalizedPeriod === 'yearly') {
      from.setFullYear(from.getFullYear() - 5);
    } else {
      from.setDate(from.getDate() - days);
    }

    // Get user's wallets first
    const userWallets = await this.prisma.wallets.findMany({
      where: { user_id: userId },
      select: { id: true, balance: true },
    });

    const walletIds = userWallets.map((w) => w.id);
    const initialBalance = userWallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);

    // Get transactions where user is sender or receiver
    const transactions = await this.prisma.transactions.findMany({
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
        sender_wallet_id: true,
        receiver_wallet_id: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    const grouped: Record<
      string,
      { date: string; amount: number; sortDate: Date }
    > = {};

    const getPeriodLabel = (date: Date) => {
      if (normalizedPeriod === 'weekly') {
        const weekStart = new Date(date);
        const dayOfWeek = (weekStart.getDay() + 6) % 7;
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        return `Week of ${weekStart.toISOString().slice(0, 10)}`;
      }

      if (normalizedPeriod === 'monthly') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (normalizedPeriod === 'yearly') {
        return `${date.getFullYear()}`;
      }

      return date.toISOString().slice(0, 10);
    };

    const getSortDate = (date: Date) => {
      if (normalizedPeriod === 'weekly') {
        const weekStart = new Date(date);
        const dayOfWeek = (weekStart.getDay() + 6) % 7;
        weekStart.setDate(weekStart.getDate() - dayOfWeek);
        return weekStart;
      }

      if (normalizedPeriod === 'monthly') {
        return new Date(date.getFullYear(), date.getMonth(), 1);
      }

      if (normalizedPeriod === 'yearly') {
        return new Date(date.getFullYear(), 0, 1);
      }

      return new Date(date.toISOString().slice(0, 10));
    };

    // Aggregate transactions by period
    for (const tx of transactions) {
      const txDate = tx.created_at!;
      const label = getPeriodLabel(txDate);
      const sortDate = getSortDate(txDate);

      if (!grouped[label]) {
        grouped[label] = {
          date: label,
          amount: 0,
          sortDate,
        };
      }

      grouped[label].amount += Number(tx.amount);
    }

    const sorted = Object.values(grouped).sort(
      (a, b) => a.sortDate.getTime() - b.sortDate.getTime(),
    );

    // Calculate running balance with 12.5% growth per period
    const growthRate = 0.125;
    let runningBalance = initialBalance;
    const balanceHistory = sorted.map((period) => {
      // Apply 12.5% growth per transaction period
      runningBalance = runningBalance * (1 + growthRate);
      return {
        date: period.date,
        balance: Number(runningBalance.toFixed(2)),
      };
    });

    // Calculate overall growth percentage
    const firstValue = initialBalance;
    const lastValue = balanceHistory.length ? balanceHistory[balanceHistory.length - 1].balance : firstValue;
    const growthPercentage = firstValue > 0
      ? Number((((lastValue - firstValue) / firstValue) * 100).toFixed(1))
      : lastValue > 0
        ? 100
        : 0;

    return {
      data: balanceHistory.length ? balanceHistory : [
        { date: new Date().toISOString().slice(0, 10), balance: initialBalance }
      ],
      growth_percentage: growthPercentage,
      growth_rate_per_period: 12.5,
      initial_balance: Number(initialBalance.toFixed(2)),
      current_balance: lastValue,
      period: normalizedPeriod,
    };
  }

}