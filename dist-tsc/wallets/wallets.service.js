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
var WalletsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const security_service_1 = require("../security/security.service");
const notifications_service_1 = require("../notifications/notifications.service");
const reference_util_1 = require("../common/utils/reference.util");
const pagination_util_1 = require("../common/utils/pagination.util");
let WalletsService = WalletsService_1 = class WalletsService {
    constructor(prisma, authService, securityService, notificationsService) {
        this.prisma = prisma;
        this.authService = authService;
        this.securityService = securityService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(WalletsService_1.name);
    }
    async getMyWallet(userId) {
        const wallet = await this.prisma.wallets.findFirst({
            where: { user_id: userId, is_active: true },
        });
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
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
    async sendFunds(senderId, dto, ip) {
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('Amount must be greater than zero');
        if (dto.biometric_auth) {
            const deviceFingerprint = dto.device_fingerprint || dto.deviceFingerprint;
            if (!deviceFingerprint) {
                throw new common_1.BadRequestException('Device fingerprint required for biometric authorization');
            }
            const verified = await this.securityService.verifyDevice(senderId, deviceFingerprint);
            if (!verified || !('trusted' in verified) || verified.trusted !== true) {
                throw new common_1.ForbiddenException('Biometric device verification failed');
            }
        }
        else {
            if (!dto.pin)
                throw new common_1.BadRequestException('Transaction PIN is required');
            await this.authService.verifyPin(senderId, dto.pin);
        }
        const receiverUser = await this.prisma.users.findFirst({
            where: {
                OR: [{ username: dto.recipient_identifier }, { phone: dto.recipient_identifier }],
                is_deleted: false,
                is_active: true,
            },
            include: { wallets: { where: { is_active: true }, take: 1 } },
        });
        const receiverUserId = receiverUser?.id;
        let receiverWalletId;
        if (receiverUser?.wallets[0]) {
            receiverWalletId = receiverUser.wallets[0].id;
        }
        else {
            const byAddress = await this.prisma.wallets.findUnique({
                where: { wallet_address: dto.recipient_identifier },
            });
            if (!byAddress)
                throw new common_1.NotFoundException('Recipient not found');
            receiverWalletId = byAddress.id;
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const senderWallet = await tx.wallets.findFirst({
                where: { user_id: senderId, is_active: true },
            });
            if (!senderWallet)
                throw new common_1.NotFoundException('Sender wallet not found');
            if (senderWallet.is_frozen)
                throw new common_1.ForbiddenException('Your wallet is frozen. Contact support.');
            const MAX_SINGLE_TX = 100_000;
            if (dto.amount > MAX_SINGLE_TX) {
                throw new common_1.BadRequestException(`Single transfer limit is ${MAX_SINGLE_TX} FARM`);
            }
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
            const MAX_DAILY = 500_000;
            const sentToday = Number(dailyVolume._sum.amount ?? 0);
            if (sentToday + dto.amount > MAX_DAILY) {
                throw new common_1.BadRequestException('Daily transfer limit exceeded');
            }
            if (senderWallet.id === receiverWalletId) {
                throw new common_1.BadRequestException('Cannot send to yourself');
            }
            const feeCfg = await tx.fee_configurations.findFirst({
                where: { transaction_type: 'transfer', is_active: true },
            });
            const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
            const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
            let fee = dto.amount * pctFee + flatFee;
            if (feeCfg)
                fee = Math.max(Number(feeCfg.minimum_fee), Math.min(Number(feeCfg.maximum_fee ?? 999999), fee));
            const totalOut = dto.amount + fee;
            const available = Number(senderWallet.balance) - Number(senderWallet.locked_balance);
            if (available < totalOut) {
                throw new common_1.BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
            }
            const cooldownWindow = new Date(Date.now() - 60_000);
            const recentDuplicate = await tx.transactions.findFirst({
                where: {
                    sender_wallet_id: senderWallet.id,
                    transaction_type: 'transfer',
                    amount: dto.amount,
                    status: 'completed',
                    created_at: { gte: cooldownWindow },
                },
                orderBy: { created_at: 'desc' },
            });
            if (recentDuplicate) {
                throw new common_1.BadRequestException('You can only resend the same amount after 1 minute.');
            }
            const reference = (0, reference_util_1.generateTxReference)();
            const transaction = await tx.transactions.create({
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
            if (!recvWallet)
                throw new common_1.NotFoundException('Recipient wallet not found');
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
                        transaction_id: transaction.id,
                        wallet_id: senderWallet.id,
                        entry_type: 'debit',
                        amount: totalOut,
                        balance_before: Number(senderWallet.balance),
                        balance_after: Number(senderWallet.balance) - totalOut,
                        description: `Transfer to ${dto.recipient_identifier}`,
                    },
                    {
                        transaction_id: transaction.id,
                        wallet_id: receiverWalletId,
                        entry_type: 'credit',
                        amount: dto.amount,
                        balance_before: Number(recvWallet.balance),
                        balance_after: Number(recvWallet.balance) + dto.amount,
                        description: 'Transfer received',
                    },
                ],
            });
            await tx.transactions.update({
                where: { id: transaction.id },
                data: { status: 'completed', processed_at: new Date() },
            });
            return {
                data: { transaction_reference: reference, amount: dto.amount, fee, status: 'completed' },
                message: 'Transfer successful',
            };
        });
        if (receiverUserId) {
            this.notificationsService
                .notifyTransfer(senderId, receiverUserId, dto.amount, result.data.transaction_reference)
                .catch((error) => this.logger.error('Transfer notification failed', error));
        }
        return result;
    }
    async getTransactions(userId, query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
        const where = { OR: [{ sender_wallet_id: wallet.id }, { receiver_wallet_id: wallet.id }] };
        if (query.type)
            where.transaction_type = query.type;
        if (query.status)
            where.status = query.status;
        const [txns, total] = await Promise.all([
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
        return {
            data: txns.map((t) => {
                const senderUser = this.buildUserSummary(t.wallets_transactions_sender_wallet_idTowallets?.users);
                const recipientUser = this.buildUserSummary(t.wallets_transactions_receiver_wallet_idTowallets?.users);
                return {
                    ...t,
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
                };
            }),
            meta: (0, pagination_util_1.paginate)(total, page, limit),
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
};
exports.WalletsService = WalletsService;
exports.WalletsService = WalletsService = WalletsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        security_service_1.SecurityService,
        notifications_service_1.NotificationsService])
], WalletsService);
//# sourceMappingURL=wallets.service.js.map