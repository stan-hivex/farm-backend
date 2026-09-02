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
exports.MerchantsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const qr_service_1 = require("../qr/qr.service");
const pagination_util_1 = require("../common/utils/pagination.util");
const crypto_1 = require("crypto");
let MerchantsService = class MerchantsService {
    constructor(prisma, qrService) {
        this.prisma = prisma;
        this.qrService = qrService;
    }
    async apply(userId, dto) {
        const existing = await this.prisma.merchants.findFirst({ where: { user_id: userId } });
        if (existing)
            throw new common_1.BadRequestException('You already have a merchant application');
        const merchant = await this.prisma.merchants.create({
            data: {
                user_id: userId, ...dto,
                qr_secret: (0, crypto_1.randomBytes)(32).toString('hex'),
                status: 'pending',
            },
        });
        return { data: merchant, message: 'Application submitted. Pending review.' };
    }
    async getDashboard(userId) {
        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { kyc_status: true, kyc_level: true },
        });
        if (!user || user.kyc_status !== 'verified' || Number(user.kyc_level || 0) < 3) {
            throw new common_1.ForbiddenException('Full KYC verification is required to access the merchant dashboard');
        }
        const merchant = await this.getMerchantByUser(userId);
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const qrData = await this.qrService.getMerchantQr(merchant.id);
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const [salesToday, totalRevenue, currentMonthRevenue, previousMonthRevenue, recentTxns] = await Promise.all([
            this.prisma.transactions.aggregate({
                where: {
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'merchant_payment',
                    status: 'completed',
                    created_at: { gte: today },
                },
                _sum: { amount: true }, _count: true,
            }),
            this.prisma.transactions.aggregate({
                where: {
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'merchant_payment',
                    status: 'completed',
                },
                _sum: { amount: true }, _count: true,
            }),
            this.prisma.transactions.aggregate({
                where: {
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'merchant_payment',
                    status: 'completed',
                    created_at: { gte: currentMonthStart, lt: nextMonthStart },
                },
                _sum: { amount: true },
            }),
            this.prisma.transactions.aggregate({
                where: {
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'merchant_payment',
                    status: 'completed',
                    created_at: { gte: previousMonthStart, lt: currentMonthStart },
                },
                _sum: { amount: true },
            }),
            this.prisma.transactions.findMany({
                where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
                orderBy: { created_at: 'desc' }, take: 10,
            }),
        ]);
        const currentMonthRevenueValue = Number(currentMonthRevenue._sum.amount || 0);
        const previousMonthRevenueValue = Number(previousMonthRevenue._sum.amount || 0);
        const monthlyGrowth = previousMonthRevenueValue === 0
            ? (currentMonthRevenueValue === 0 ? 0 : 100)
            : Number((((currentMonthRevenueValue - previousMonthRevenueValue) / previousMonthRevenueValue) * 100).toFixed(2));
        const enrichedRecent = await Promise.all(recentTxns.map(async (t) => {
            const txn = { ...t };
            txn.amount = Number(txn.amount || 0);
            let customerId;
            if (txn.customer_id)
                customerId = txn.customer_id;
            if (!customerId && txn.metadata && typeof txn.metadata === 'object') {
                customerId = txn.metadata.user_id || txn.metadata.customer_id;
            }
            let customerName = '@user';
            let merchantBusinessName = '';
            if (customerId) {
                const u = await this.prisma.users.findUnique({ where: { id: customerId } });
                if (u && u.username)
                    customerName = `@${u.username}`;
            }
            else if (txn.sender_wallet_id) {
                const senderWallet = await this.prisma.wallets.findUnique({
                    where: { id: txn.sender_wallet_id },
                    include: { users: true },
                });
                const u = senderWallet?.users;
                if (u && u.username)
                    customerName = `@${u.username}`;
            }
            if (txn.metadata && typeof txn.metadata === 'object') {
                const merchantId = txn.metadata.merchant_id || txn.metadata.merchantId;
                if (merchantId) {
                    const merchant = await this.prisma.merchants.findUnique({
                        where: { id: merchantId },
                        select: { business_name: true },
                    });
                    if (merchant?.business_name)
                        merchantBusinessName = merchant.business_name;
                }
            }
            txn.customer_name = customerName;
            txn.merchant_business_name = merchantBusinessName;
            return txn;
        }));
        return {
            data: {
                merchant: {
                    id: merchant.id, business_name: merchant.business_name,
                    status: merchant.status, qr_code: merchant.qr_code,
                    qr_payload: qrData?.data?.qr_payload ?? merchant.qr_code,
                    qr_image_base64: qrData?.data?.qr_image_base64,
                    qr_image_data_url: qrData?.data?.qr_image_data_url ?? qrData?.data?.qr_image_base64,
                    qrImageBase64: qrData?.data?.qr_image_base64,
                    qrImageDataUrl: qrData?.data?.qr_image_data_url ?? qrData?.data?.qr_image_base64,
                },
                stats: {
                    sales_today: Number(salesToday._sum.amount || 0),
                    sales_today_count: salesToday._count,
                    total_revenue: Number(totalRevenue._sum.amount || 0),
                    total_transactions: totalRevenue._count,
                    wallet_balance: Number(wallet?.balance || 0),
                    current_month_revenue: currentMonthRevenueValue,
                    previous_month_revenue: previousMonthRevenueValue,
                    monthly_growth_percentage: monthlyGrowth,
                },
                recent_transactions: enrichedRecent,
            },
        };
    }
    async getMyMerchant(userId) {
        return { data: await this.getMerchantByUser(userId) };
    }
    async getTransactions(userId, query) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const [items, total] = await Promise.all([
            this.prisma.transactions.findMany({
                where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
                skip, take, orderBy: { created_at: 'desc' },
            }),
            this.prisma.transactions.count({
                where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
            }),
        ]);
        return {
            data: items.map((t) => ({ ...t, amount: Number(t.amount) })),
            meta: (0, pagination_util_1.paginate)(total, page, limit),
        };
    }
    async requestPayout(userId, dto) {
        const merchant = await this.getMerchantByUser(userId);
        if (merchant.status !== 'approved')
            throw new common_1.ForbiddenException('Merchant not approved');
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        const available = Number(wallet?.balance || 0) - Number(wallet?.locked_balance || 0);
        if (available < dto.amount)
            throw new common_1.BadRequestException('Insufficient balance');
        const payout = await this.prisma.merchant_payouts.create({
            data: {
                merchant_id: merchant.id, amount: dto.amount,
                payout_method: dto.payout_method, account_name: dto.account_name,
                account_number: dto.account_number, status: 'pending',
            },
        });
        return { data: payout, message: 'Payout request submitted' };
    }
    async getPayouts(userId, query) {
        const merchant = await this.getMerchantByUser(userId);
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const [items, total] = await Promise.all([
            this.prisma.merchant_payouts.findMany({
                where: { merchant_id: merchant.id }, skip, take, orderBy: { created_at: 'desc' },
            }),
            this.prisma.merchant_payouts.count({ where: { merchant_id: merchant.id } }),
        ]);
        return {
            data: items.map((p) => ({ ...p, amount: Number(p.amount) })),
            meta: (0, pagination_util_1.paginate)(total, page, limit),
        };
    }
    async regenerateQr(userId) {
        const merchant = await this.getMerchantByUser(userId);
        return this.qrService.generateMerchantQr(merchant.id);
    }
    async getMerchantQr(userId) {
        const merchant = await this.getMerchantByUser(userId);
        if (!merchant.qr_code) {
            return this.qrService.generateMerchantQr(merchant.id);
        }
        return this.qrService.getMerchantQr(merchant.id);
    }
    async getMerchantByUser(userId) {
        const m = await this.prisma.merchants.findFirst({ where: { user_id: userId } });
        if (!m)
            throw new common_1.BadRequestException('Merchant account not found. Please apply first.');
        return m;
    }
};
exports.MerchantsService = MerchantsService;
exports.MerchantsService = MerchantsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, qr_service_1.QrService])
], MerchantsService);
//# sourceMappingURL=merchants.service.js.map