"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
let AnalyticsService = class AnalyticsService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async getPlatformStats(period = 'month') {
        const cacheKey = `analytics:platform-stats:${period}`;
        const cached = await this.cache.cacheGet(cacheKey);
        if (cached)
            return cached;
        const from = new Date();
        if (period === 'day')
            from.setDate(from.getDate() - 1);
        else if (period === 'week')
            from.setDate(from.getDate() - 7);
        else
            from.setMonth(from.getMonth() - 1);
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
        const payload = {
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
        await this.cache.cacheSet(cacheKey, payload, 90);
        return payload;
    }
    async getTransactionVolume(days = 30) {
        const cacheKey = `analytics:transaction-volume:${days}`;
        const cached = await this.cache.cacheGet(cacheKey);
        if (cached)
            return cached;
        const from = new Date();
        from.setDate(from.getDate() - days);
        const txns = await this.prisma.transactions.findMany({
            where: { status: 'completed', created_at: { gte: from } },
            select: { created_at: true, amount: true, transaction_type: true },
            orderBy: { created_at: 'asc' },
        });
        const byDay = {};
        for (const t of txns) {
            const day = t.created_at.toISOString().slice(0, 10);
            if (!byDay[day])
                byDay[day] = { date: day, total: 0, count: 0 };
            byDay[day].total += Number(t.amount);
            byDay[day].count++;
        }
        const payload = { data: Object.values(byDay) };
        await this.cache.cacheSet(cacheKey, payload, 90);
        return payload;
    }
    async getUserGrowthHistory(userId, days = 7, period = 'daily') {
        const cacheKey = `analytics:user-growth:${userId}:${days}:${period}`;
        const cached = await this.cache.cacheGet(cacheKey);
        if (cached)
            return cached;
        const normalizedPeriod = period?.toString().trim().toLowerCase() || 'daily';
        const from = new Date();
        if (normalizedPeriod === 'weekly') {
            from.setDate(from.getDate() - 84);
        }
        else if (normalizedPeriod === 'monthly') {
            from.setFullYear(from.getFullYear() - 1);
        }
        else if (normalizedPeriod === 'yearly') {
            from.setFullYear(from.getFullYear() - 5);
        }
        else {
            from.setDate(from.getDate() - days);
        }
        const userWallets = await this.prisma.wallets.findMany({
            where: { user_id: userId },
            select: { id: true },
        });
        const walletIds = userWallets.map((w) => w.id);
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
            },
            orderBy: {
                created_at: 'asc',
            },
        });
        const grouped = {};
        const getPeriodLabel = (date) => {
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
        const getSortDate = (date) => {
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
        for (const tx of transactions) {
            const txDate = tx.created_at;
            const label = getPeriodLabel(txDate);
            const sortDate = getSortDate(txDate);
            if (!grouped[label]) {
                grouped[label] = {
                    date: label,
                    total: 0,
                    sortDate,
                };
            }
            grouped[label].total += Number(tx.amount);
        }
        const sorted = Object.values(grouped).sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
        const firstValue = sorted.length ? sorted[0].total : 0;
        const lastValue = sorted.length ? sorted[sorted.length - 1].total : 0;
        const growthPercentage = firstValue > 0
            ? Number((((lastValue - firstValue) / firstValue) * 100).toFixed(1))
            : lastValue > 0
                ? 100
                : 0;
        const payload = {
            data: sorted.map((item) => ({ date: item.date, total: item.total })),
            growth_percentage: growthPercentage,
            period: normalizedPeriod,
        };
        await this.cache.cacheSet(cacheKey, payload, 90);
        return payload;
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map