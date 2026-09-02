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
exports.TransactionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
const pagination_util_1 = require("../common/utils/pagination.util");
let TransactionsService = class TransactionsService {
    constructor(prisma, cache) {
        this.prisma = prisma;
        this.cache = cache;
    }
    async findAll(userId, query) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const where = { OR: [{ sender_wallet_id: wallet.id }, { receiver_wallet_id: wallet.id }] };
        if (query.type)
            where.transaction_type = query.type;
        if (query.status)
            where.status = query.status;
        const cacheKey = `transactions:${userId}:${page}:${limit}`;
        const cached = await this.cache.cacheGet(cacheKey);
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
            ...new Set(items
                .map((t) => {
                const metadata = t.metadata;
                if (metadata && typeof metadata === 'object') {
                    return metadata.merchant_id || metadata.merchantId;
                }
                return null;
            })
                .filter((id) => id != null)),
        ];
        const merchantMap = {};
        if (merchantIds.length > 0) {
            const merchants = await this.prisma.merchants.findMany({
                where: { id: { in: merchantIds } },
                select: { id: true, business_name: true },
            });
            merchants.forEach((m) => {
                if (m.id && m.business_name)
                    merchantMap[m.id] = m.business_name;
            });
        }
        const payload = {
            data: items.map((t) => {
                const normalizedStatus = this.normalizeTransactionStatus(t.status, t.transaction_type);
                const normalizedDescription = this.normalizeTransactionDescription(t.transaction_type, normalizedStatus, t.description);
                const senderUser = this.buildUserSummary(t.wallets_transactions_sender_wallet_idTowallets?.users);
                const recipientUser = this.buildUserSummary(t.wallets_transactions_receiver_wallet_idTowallets?.users);
                let merchantBusinessName = '';
                if (t.metadata && typeof t.metadata === 'object') {
                    const merchantId = t.metadata.merchant_id || t.metadata.merchantId;
                    if (merchantId)
                        merchantBusinessName = merchantMap[merchantId] || '';
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
            meta: (0, pagination_util_1.paginate)(total, page, limit),
        };
        await this.cache.cacheSet(cacheKey, payload, 45);
        return payload;
    }
    async findOne(userId, txId) {
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
        if (!txn)
            throw new common_1.NotFoundException('Transaction not found');
        const normalizedStatus = this.normalizeTransactionStatus(txn.status, txn.transaction_type);
        const senderUser = this.buildUserSummary(txn.wallets_transactions_sender_wallet_idTowallets?.users);
        const recipientUser = this.buildUserSummary(txn.wallets_transactions_receiver_wallet_idTowallets?.users);
        let merchantBusinessName = '';
        if (txn.metadata && typeof txn.metadata === 'object') {
            const merchantId = txn.metadata.merchant_id || txn.metadata.merchantId;
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
    buildUserSummary(user) {
        if (!user)
            return null;
        return {
            id: user.id,
            username: user.username ?? '',
            first_name: user.first_name ?? null,
            last_name: user.last_name ?? null,
            profile_image: user.profile_image ?? null,
        };
    }
    normalizeTransactionStatus(status, transactionType) {
        const normalized = (status ?? '').toString().toLowerCase();
        const successfulStatuses = ['completed', 'success', 'successful', 'succeeded', 'paid', 'settled'];
        const pendingStatuses = ['pending', 'processing', 'initiated', 'in_progress'];
        const failedStatuses = ['failed', 'cancelled', 'reversed', 'declined', 'expired', 'abandoned', 'incomplete'];
        if (successfulStatuses.includes(normalized))
            return 'Completed';
        if (pendingStatuses.includes(normalized))
            return 'Pending';
        if (failedStatuses.includes(normalized))
            return 'Failed';
        if (transactionType?.toLowerCase() === 'deposit' && normalized.includes('success'))
            return 'Completed';
        if (transactionType?.toLowerCase() === 'withdrawal' && normalized.includes('success'))
            return 'Completed';
        return status?.toString() ?? 'Pending';
    }
    normalizeTransactionDescription(transactionType, status, description) {
        const normalizedType = (transactionType ?? '').toString().toLowerCase();
        const normalizedStatus = (status ?? '').toString().toLowerCase();
        if (normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === 'successful') {
            if (normalizedType === 'deposit')
                return 'Successful deposit';
            if (normalizedType === 'withdrawal')
                return 'Successful withdrawal';
            return 'Successful transaction';
        }
        if (normalizedStatus === 'pending') {
            if (normalizedType === 'deposit')
                return 'Pending deposit';
            if (normalizedType === 'withdrawal')
                return 'Pending withdrawal';
            return 'Pending transaction';
        }
        if (normalizedStatus === 'failed') {
            return 'Failed transaction';
        }
        return description ?? 'Transaction';
    }
};
exports.TransactionsService = TransactionsService;
exports.TransactionsService = TransactionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], TransactionsService);
//# sourceMappingURL=transactions.service.js.map