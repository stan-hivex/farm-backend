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
var TransferRequestsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransferRequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const security_service_1 = require("../security/security.service");
const notifications_service_1 = require("../notifications/notifications.service");
const reference_util_1 = require("../common/utils/reference.util");
const pagination_util_1 = require("../common/utils/pagination.util");
const client_1 = require("@prisma/client");
let TransferRequestsService = TransferRequestsService_1 = class TransferRequestsService {
    constructor(prisma, authService, notificationsService, securityService) {
        this.prisma = prisma;
        this.authService = authService;
        this.notificationsService = notificationsService;
        this.securityService = securityService;
        this.logger = new common_1.Logger(TransferRequestsService_1.name);
    }
    async requestFunds(requesterUserId, dto, ip) {
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('Amount must be greater than zero');
        const MAX_SINGLE_REQUEST = 100_000;
        if (dto.amount > MAX_SINGLE_REQUEST) {
            throw new common_1.BadRequestException(`Single request limit is ${MAX_SINGLE_REQUEST} FARM`);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const requesterWallet = await tx.wallets.findFirst({
                where: { user_id: requesterUserId, is_active: true },
            });
            if (!requesterWallet)
                throw new common_1.NotFoundException('Requester wallet not found');
            const senderUser = await tx.users.findFirst({
                where: {
                    OR: [
                        { username: dto.sender_identifier },
                        { phone: dto.sender_identifier },
                    ],
                    is_deleted: false,
                    is_active: true,
                },
                include: { wallets: { where: { is_active: true }, take: 1 } },
            });
            let senderWalletId;
            let senderUserId = senderUser?.id;
            if (senderUser?.wallets[0]) {
                senderWalletId = senderUser.wallets[0].id;
            }
            else {
                const byAddress = await tx.wallets.findUnique({
                    where: { wallet_address: dto.sender_identifier },
                });
                if (!byAddress)
                    throw new common_1.NotFoundException('Sender not found');
                senderWalletId = byAddress.id;
                senderUserId = byAddress.user_id ?? undefined;
            }
            if (!senderUserId) {
                const walletOwner = await tx.wallets.findUnique({
                    where: { id: senderWalletId },
                    select: { user_id: true },
                });
                senderUserId = walletOwner?.user_id ?? undefined;
            }
            if (!senderUserId) {
                throw new common_1.NotFoundException('Sender not found');
            }
            if (requesterWallet.id === senderWalletId)
                throw new common_1.BadRequestException('Cannot request from yourself');
            if (requesterUserId === senderUserId)
                throw new common_1.BadRequestException('Cannot request from yourself');
            const reference = (0, reference_util_1.generateTxReference)();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
            const request = await tx.transfer_requests.create({
                data: {
                    request_reference: reference,
                    requester_user_id: requesterUserId,
                    requester_wallet_id: requesterWallet.id,
                    sender_user_id: senderUserId,
                    sender_wallet_id: senderWalletId,
                    amount: dto.amount,
                    currency: 'FARM',
                    description: dto.description || `Money request from ${senderUser?.username ?? 'a user'}`,
                    status: 'pending',
                    expires_at: expiresAt,
                    ip_address: ip,
                },
                include: {
                    users_requester: { select: { id: true, username: true, first_name: true, last_name: true } },
                    users_sender: { select: { id: true, username: true, first_name: true, last_name: true } },
                },
            });
            return {
                request,
                data: {
                    request_id: request.id,
                    request_reference: reference,
                    status: 'pending',
                    amount: dto.amount,
                    expires_at: expiresAt,
                },
                message: 'Transfer request created successfully',
            };
        });
        const request = result.request;
        if (request && request.users_requester && request.users_sender) {
            const title = 'Money request received';
            const body = `${request.users_requester.username ?? 'A user'} requested ${dto.amount} FARM from you.`;
            await Promise.all([
                this.notificationsService.createInApp(request.users_sender.id, {
                    type: 'transfer_request',
                    title,
                    body,
                    metadata: {
                        request_id: request.id,
                        requester_username: request.users_requester.username,
                        amount: dto.amount,
                    },
                }),
                this.notificationsService.sendPush(request.users_sender.id, title, body, {
                    request_id: request.id,
                    type: 'transfer_request',
                }),
            ]);
        }
        return {
            data: result.data,
            message: result.message,
        };
    }
    async getPendingRequests(userId, query) {
        const { skip, take } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const now = new Date();
        await this.prisma.transfer_requests.updateMany({
            where: {
                sender_user_id: userId,
                status: 'pending',
                expires_at: {
                    lte: now,
                },
            },
            data: {
                status: 'expired',
            },
        });
        const requests = await this.prisma.transfer_requests.findMany({
            where: {
                sender_user_id: userId,
                status: 'pending',
                expires_at: {
                    gt: now,
                },
            },
            include: {
                users_requester: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                        profile_image: true,
                    },
                },
                users_sender: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take,
        });
        const total = await this.prisma.transfer_requests.count({
            where: {
                sender_user_id: userId,
                status: 'pending',
                expires_at: {
                    gt: now,
                },
            },
        });
        return {
            data: requests,
            pagination: {
                total,
                page: query.page || 1,
                limit: query.limit || 10,
            },
        };
    }
    async acceptAndTransfer(senderUserId, dto, ip) {
        if (dto.biometric_auth) {
            const deviceFingerprint = dto.device_fingerprint || dto.deviceFingerprint;
            if (!deviceFingerprint)
                throw new common_1.BadRequestException('Device fingerprint required for biometric authorization');
            const verified = await this.securityService.verifyDevice(senderUserId, deviceFingerprint);
            if (!verified || verified.trusted !== true) {
                throw new common_1.BadRequestException('Biometric device verification failed');
            }
        }
        else {
            if (!dto.pin)
                throw new common_1.BadRequestException('Transaction PIN is required');
            await this.authService.verifyPin(senderUserId, dto.pin);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const request = await tx.transfer_requests.findUnique({
                where: { id: dto.request_id },
                include: {
                    wallets_sender: true,
                    wallets_requester: true,
                    users_sender: true,
                    users_requester: true,
                },
            });
            if (!request)
                throw new common_1.NotFoundException('Transfer request not found');
            if (request.sender_user_id !== senderUserId)
                throw new common_1.ForbiddenException('You are not authorized for this request');
            if (request.status !== 'pending')
                throw new common_1.BadRequestException(`Request status is ${request.status}`);
            if (request.expires_at && request.expires_at < new Date()) {
                await tx.transfer_requests.update({
                    where: { id: request.id },
                    data: { status: 'expired' },
                });
                throw new common_1.BadRequestException('This request has expired');
            }
            if (!request.wallets_sender)
                throw new common_1.NotFoundException('Sender wallet not found');
            if (request.wallets_sender.is_frozen)
                throw new common_1.ForbiddenException('Your wallet is frozen. Contact support.');
            const senderWallet = request.wallets_sender;
            const requesterWallet = request.wallets_requester;
            const amount = request.amount;
            const feeCfg = await tx.fee_configurations.findFirst({
                where: { transaction_type: 'transfer', is_active: true },
            });
            const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
            const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
            let fee = new client_1.Prisma.Decimal(flatFee);
            if (feeCfg) {
                fee = amount.mul(pctFee).plus(flatFee);
                fee = client_1.Prisma.Decimal.max(new client_1.Prisma.Decimal(feeCfg.minimum_fee ?? 0), client_1.Prisma.Decimal.min(new client_1.Prisma.Decimal(feeCfg.maximum_fee ?? 999999), fee));
            }
            const totalOut = amount.plus(fee);
            const senderBalance = senderWallet.balance ?? new client_1.Prisma.Decimal(0);
            const senderLocked = senderWallet.locked_balance ?? new client_1.Prisma.Decimal(0);
            const available = senderBalance.minus(senderLocked);
            if (available.lt(totalOut))
                throw new common_1.BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
            const reference = (0, reference_util_1.generateTxReference)();
            const transaction = await tx.transactions.create({
                data: {
                    transaction_reference: reference,
                    sender_wallet_id: senderWallet.id,
                    receiver_wallet_id: requesterWallet.id,
                    transaction_type: 'transfer',
                    status: 'processing',
                    amount: amount,
                    fee,
                    net_amount: amount.minus(fee),
                    currency: 'FARM',
                    description: request.description || `Transfer from ${request.users_sender?.username}`,
                    ip_address: ip,
                    metadata: { request_id: request.id },
                },
            });
            await tx.wallets.update({
                where: { id: senderWallet.id },
                data: { balance: { decrement: totalOut } },
            });
            await tx.wallets.update({
                where: { id: requesterWallet.id },
                data: { balance: { increment: amount } },
            });
            const requesterBalance = requesterWallet.balance ?? new client_1.Prisma.Decimal(0);
            await tx.ledger_entries.createMany({
                data: [
                    {
                        transaction_id: transaction.id,
                        wallet_id: senderWallet.id,
                        entry_type: 'debit',
                        amount: totalOut,
                        balance_before: senderBalance,
                        balance_after: senderBalance.minus(totalOut),
                        description: `Transfer via request from ${request.users_requester?.username}`,
                    },
                    {
                        transaction_id: transaction.id,
                        wallet_id: requesterWallet.id,
                        entry_type: 'credit',
                        amount: amount,
                        balance_before: requesterBalance,
                        balance_after: requesterBalance.plus(amount),
                        description: 'Transfer received from request',
                    },
                ],
            });
            await tx.transactions.update({
                where: { id: transaction.id },
                data: { status: 'completed', processed_at: new Date() },
            });
            await tx.transfer_requests.update({
                where: { id: request.id },
                data: {
                    status: 'completed',
                    transaction_id: transaction.id,
                    accepted_at: new Date(),
                    completed_at: new Date(),
                },
            });
            return {
                data: {
                    transaction_reference: reference,
                    amount: amount,
                    fee,
                    status: 'completed',
                    request_reference: request.request_reference,
                },
                message: 'Transfer completed successfully',
                requesterUserId: request.requester_user_id,
            };
        });
        await this.notificationsService.notifyTransfer(senderUserId, result.requesterUserId, Number(result.data.amount), result.data.transaction_reference);
        return {
            data: result.data,
            message: result.message,
        };
    }
    async rejectRequest(senderUserId, requestId) {
        const request = await this.prisma.transfer_requests.findUnique({
            where: { id: requestId },
        });
        if (!request)
            throw new common_1.NotFoundException('Transfer request not found');
        if (request.sender_user_id !== senderUserId)
            throw new common_1.ForbiddenException('You are not authorized for this request');
        if (request.status !== 'pending')
            throw new common_1.BadRequestException(`Request status is ${request.status}`);
        const updated = await this.prisma.transfer_requests.update({
            where: { id: requestId },
            data: {
                status: 'rejected',
                rejected_at: new Date(),
            },
        });
        await this.notificationsService.sendNotification(request.requester_user_id, {
            type: 'request_declined',
            entityId: request.id,
            title: 'Transfer Request Declined',
            body: 'Your transfer request was declined.',
        });
        return {
            data: { status: 'rejected', request_reference: updated.request_reference },
            message: 'Transfer request rejected',
        };
    }
    async cancelRequest(requesterUserId, requestId) {
        const request = await this.prisma.transfer_requests.findUnique({
            where: { id: requestId },
        });
        if (!request)
            throw new common_1.NotFoundException('Transfer request not found');
        if (request.requester_user_id !== requesterUserId)
            throw new common_1.ForbiddenException('You are not authorized for this request');
        if (request.status !== 'pending')
            throw new common_1.BadRequestException(`Request status is ${request.status}`);
        const updated = await this.prisma.transfer_requests.update({
            where: { id: requestId },
            data: {
                status: 'cancelled',
                updated_at: new Date(),
            },
        });
        return {
            data: { status: 'cancelled', request_reference: updated.request_reference },
            message: 'Transfer request cancelled',
        };
    }
    async processExpiredRequests() {
        const now = new Date();
        const expired = await this.prisma.transfer_requests.findMany({
            where: { status: 'pending', expires_at: { lte: now } },
        });
        if (!expired || expired.length === 0)
            return 0;
        let processed = 0;
        for (const request of expired) {
            try {
                await this.prisma.transfer_requests.update({
                    where: { id: request.id },
                    data: { status: 'expired' },
                });
                const amount = Number(request.amount ?? 0);
                await Promise.all([
                    request.requester_user_id
                        ? this.notificationsService.sendNotification(request.requester_user_id, {
                            type: 'transfer_request_expired',
                            entityId: request.id,
                            title: 'Transfer Request Expired',
                            body: `Your transfer request for ${amount} FARM has expired.`,
                            metadata: { request_id: request.id, amount },
                        })
                        : Promise.resolve(null),
                    request.sender_user_id
                        ? this.notificationsService.sendNotification(request.sender_user_id, {
                            type: 'transfer_request_expired',
                            entityId: request.id,
                            title: 'Transfer Request Expired',
                            body: `A transfer request you received for ${amount} FARM has expired.`,
                            metadata: { request_id: request.id, amount },
                        })
                        : Promise.resolve(null),
                ]).catch((err) => this.logger.error('Transfer request expiry notification failed', err));
                processed++;
            }
            catch (e) {
                this.logger.error(`Failed to process expiry for request ${request.id}: ${e}`);
            }
        }
        return processed;
    }
    async getRequestDetails(userId, requestId) {
        const request = await this.prisma.transfer_requests.findUnique({
            where: { id: requestId },
            include: {
                users_requester: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                        profile_image: true,
                    },
                },
                users_sender: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                    },
                },
                transactions: {
                    select: {
                        transaction_reference: true,
                        status: true,
                    },
                },
            },
        });
        if (!request)
            throw new common_1.NotFoundException('Transfer request not found');
        if (request.sender_user_id !== userId &&
            request.requester_user_id !== userId) {
            throw new common_1.ForbiddenException('Unauthorized to view this request');
        }
        return { data: request };
    }
    async getMyRequestHistory(userId, query) {
        const { skip, take } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const requests = await this.prisma.transfer_requests.findMany({
            where: {
                OR: [
                    { requester_user_id: userId },
                    { sender_user_id: userId },
                ],
            },
            include: {
                users_requester: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                        profile_image: true,
                    },
                },
                users_sender: {
                    select: {
                        id: true,
                        username: true,
                        first_name: true,
                        last_name: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take,
        });
        const total = await this.prisma.transfer_requests.count({
            where: {
                OR: [
                    { requester_user_id: userId },
                    { sender_user_id: userId },
                ],
            },
        });
        return {
            data: requests,
            pagination: {
                total,
                page: query.page || 1,
                limit: query.limit || 10,
            },
        };
    }
};
exports.TransferRequestsService = TransferRequestsService;
exports.TransferRequestsService = TransferRequestsService = TransferRequestsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        notifications_service_1.NotificationsService,
        security_service_1.SecurityService])
], TransferRequestsService);
//# sourceMappingURL=transfer-requests.service.js.map