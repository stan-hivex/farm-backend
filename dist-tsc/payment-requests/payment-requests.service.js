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
var PaymentRequestsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const notifications_service_1 = require("../notifications/notifications.service");
const reference_util_1 = require("../common/utils/reference.util");
const pagination_util_1 = require("../common/utils/pagination.util");
const client_1 = require("@prisma/client");
const payment_request_expiry_1 = require("./payment-request-expiry");
let PaymentRequestsService = PaymentRequestsService_1 = class PaymentRequestsService {
    constructor(prisma, authService, notificationsService) {
        this.prisma = prisma;
        this.authService = authService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(PaymentRequestsService_1.name);
    }
    async createRequest(requesterUserId, dto, ip) {
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('Amount must be greater than zero');
        const MAX_SINGLE_REQUEST = 100_000;
        if (dto.amount > MAX_SINGLE_REQUEST)
            throw new common_1.BadRequestException(`Single request limit is ${MAX_SINGLE_REQUEST} FARM`);
        const result = await this.prisma.$transaction(async (tx) => {
            const requesterWallet = await tx.wallets.findFirst({ where: { user_id: requesterUserId, is_active: true } });
            if (!requesterWallet)
                throw new common_1.NotFoundException('Requester wallet not found');
            const recipientUser = await tx.users.findFirst({
                where: {
                    OR: [{ username: dto.recipient_identifier }, { phone: dto.recipient_identifier }],
                    is_deleted: false,
                    is_active: true,
                },
                include: { wallets: { where: { is_active: true }, take: 1 } },
            });
            let recipientWalletId;
            let recipientUserId = recipientUser?.id;
            if (recipientUser?.wallets[0]) {
                recipientWalletId = recipientUser.wallets[0].id;
            }
            else {
                const byAddress = await tx.wallets.findUnique({ where: { wallet_address: dto.recipient_identifier } });
                if (!byAddress)
                    throw new common_1.NotFoundException('Recipient not found');
                recipientWalletId = byAddress.id;
                recipientUserId = byAddress.user_id ?? undefined;
            }
            if (!recipientUserId) {
                const walletOwner = await tx.wallets.findUnique({ where: { id: recipientWalletId }, select: { user_id: true } });
                recipientUserId = walletOwner?.user_id ?? undefined;
            }
            if (!recipientUserId)
                throw new common_1.NotFoundException('Recipient not found');
            if (requesterWallet.id === recipientWalletId)
                throw new common_1.BadRequestException('Cannot request from yourself');
            if (requesterUserId === recipientUserId)
                throw new common_1.BadRequestException('Cannot request from yourself');
            const reference = (0, reference_util_1.generateTxReference)();
            const expiresAt = new Date(Date.now() + payment_request_expiry_1.PAYMENT_REQUEST_EXPIRY_MS);
            const request = await tx.payment_requests.create({
                data: {
                    request_reference: reference,
                    requester_user_id: requesterUserId,
                    requester_wallet_id: requesterWallet.id,
                    recipient_user_id: recipientUserId,
                    recipient_wallet_id: recipientWalletId,
                    amount: dto.amount,
                    currency: 'FARM',
                    description: dto.description || `Money request to ${dto.recipient_identifier}`,
                    status: 'pending',
                    expires_at: expiresAt,
                    ip_address: ip,
                },
                include: {
                    users_requester: { select: { id: true, username: true, first_name: true, last_name: true } },
                    users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } },
                },
            });
            return {
                request,
                data: { request_id: request.id, request_reference: reference, status: 'pending', amount: dto.amount, expires_at: expiresAt },
                message: 'Payment request created successfully',
            };
        });
        const req = result.request;
        if (req && req.users_requester && req.users_recipient) {
            const title = 'Payment Request';
            const body = `${req.users_requester.username ?? 'A user'} requested ${dto.amount} FARM from you.`;
            await this.notificationsService.sendNotification(req.users_recipient.id, {
                type: 'payment_request',
                entityId: req.id,
                title,
                body,
                metadata: {
                    request_id: req.id,
                    requester_username: req.users_requester.username,
                    amount: dto.amount,
                },
            });
        }
        return { data: result.data, message: result.message };
    }
    async getPendingRequests(userId, query) {
        const { skip, take } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const now = new Date();
        await this.prisma.payment_requests.updateMany({ where: { recipient_user_id: userId, status: 'pending', expires_at: { lte: now } }, data: { status: 'expired' } });
        const requests = await this.prisma.payment_requests.findMany({
            where: { recipient_user_id: userId, status: 'pending', expires_at: { gt: now } },
            include: {
                users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } },
                users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take,
        });
        const total = await this.prisma.payment_requests.count({ where: { recipient_user_id: userId, status: 'pending', expires_at: { gt: now } } });
        return { data: requests, pagination: { total, page: query.page || 1, limit: query.limit || 10 } };
    }
    async processExpiredRequests() {
        const now = new Date();
        const expiredRequests = await this.prisma.payment_requests.findMany({
            where: { status: 'pending', expires_at: { lte: now } },
            include: { users_requester: true, users_recipient: true },
        });
        for (const request of expiredRequests) {
            await this.prisma.payment_requests.update({
                where: { id: request.id },
                data: { status: 'expired' },
            });
            await Promise.all([
                this.notificationsService.sendNotification(request.requester_user_id, {
                    type: 'payment_request_expired',
                    entityId: request.id,
                    title: 'Payment Request Expired',
                    body: 'Your payment request has expired.',
                }),
                this.notificationsService.sendNotification(request.recipient_user_id, {
                    type: 'payment_request_expired',
                    entityId: request.id,
                    title: 'Payment Request Expired',
                    body: 'A payment request sent to you has expired.',
                }),
            ]);
        }
        return expiredRequests.length;
    }
    async acceptAndTransfer(senderUserId, dto, ip) {
        await this.verifyTransactionAuthorization(senderUserId, dto);
        const result = await this.prisma.$transaction(async (tx) => {
            return this.transferRequestInTransaction(tx, senderUserId, dto.request_id, ip);
        });
        await this.notifyCompletedTransfer(senderUserId, result, dto.request_id);
        return { data: result.data, message: result.message };
    }
    async acceptAndTransferBatch(senderUserId, dto, ip) {
        const requestIds = [...new Set(dto.request_ids)];
        if (requestIds.length === 0)
            throw new common_1.BadRequestException('At least one request is required');
        await this.verifyTransactionAuthorization(senderUserId, dto);
        const results = await this.prisma.$transaction(async (tx) => {
            const completed = [];
            for (const requestId of requestIds) {
                completed.push(await this.transferRequestInTransaction(tx, senderUserId, requestId, ip));
            }
            return completed;
        });
        await Promise.all(results.map((result) => this.notifyCompletedTransfer(senderUserId, result, result.requestId)));
        return {
            data: { request_ids: requestIds, transactions: results.map((result) => result.data), status: 'completed' },
            message: `${results.length} payment request${results.length === 1 ? '' : 's'} completed successfully`,
        };
    }
    async verifyTransactionAuthorization(userId, dto) {
        if (dto.pin) {
            await this.authService.verifyPin(userId, dto.pin);
            return;
        }
        if (dto.biometric_auth === true)
            return;
        throw new common_1.BadRequestException('PIN or biometric authorization is required');
    }
    async transferRequestInTransaction(tx, senderUserId, requestId, ip) {
        const request = await tx.payment_requests.findUnique({ where: { id: requestId }, include: { wallets_recipient: true, wallets_requester: true, users_recipient: true, users_requester: true } });
        if (!request)
            throw new common_1.NotFoundException('Payment request not found');
        if (request.recipient_user_id !== senderUserId)
            throw new common_1.ForbiddenException('You are not authorized for this request');
        if (request.status !== 'pending')
            throw new common_1.BadRequestException(`Request status is ${request.status}`);
        if (request.expires_at && request.expires_at < new Date()) {
            await tx.payment_requests.update({ where: { id: request.id }, data: { status: 'expired' } });
            throw new common_1.BadRequestException('This request has expired');
        }
        if (!request.wallets_recipient)
            throw new common_1.NotFoundException('Payer wallet not found');
        if (request.wallets_recipient.is_frozen)
            throw new common_1.ForbiddenException('Your wallet is frozen. Contact support.');
        const payerWallet = request.wallets_recipient;
        const requesterWallet = request.wallets_requester;
        const amount = request.amount;
        const feeCfg = await tx.fee_configurations.findFirst({ where: { transaction_type: 'transfer', is_active: true } });
        const pctFee = feeCfg ? Number(feeCfg.percentage_fee) / 100 : 0;
        const flatFee = feeCfg ? Number(feeCfg.flat_fee) : 0;
        let fee = new client_1.Prisma.Decimal(flatFee);
        if (feeCfg) {
            fee = amount.mul(pctFee).plus(flatFee);
            fee = client_1.Prisma.Decimal.max(new client_1.Prisma.Decimal(feeCfg.minimum_fee ?? 0), client_1.Prisma.Decimal.min(new client_1.Prisma.Decimal(feeCfg.maximum_fee ?? 999999), fee));
        }
        const totalOut = amount.plus(fee);
        const payerBalance = payerWallet.balance ?? new client_1.Prisma.Decimal(0);
        const payerLocked = payerWallet.locked_balance ?? new client_1.Prisma.Decimal(0);
        const available = payerBalance.minus(payerLocked);
        if (available.lt(totalOut))
            throw new common_1.BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
        const reference = (0, reference_util_1.generateTxReference)();
        const transaction = await tx.transactions.create({ data: { transaction_reference: reference, sender_wallet_id: payerWallet.id, receiver_wallet_id: requesterWallet.id, transaction_type: 'transfer', status: 'processing', amount: amount, fee, net_amount: amount.minus(fee), currency: 'FARM', description: request.description || `Payment request from ${request.users_recipient?.username}`, ip_address: ip, metadata: { request_id: request.id } } });
        await tx.wallets.update({ where: { id: payerWallet.id }, data: { balance: { decrement: totalOut } } });
        await tx.wallets.update({ where: { id: requesterWallet.id }, data: { balance: { increment: amount } } });
        const requesterBalance = requesterWallet.balance ?? new client_1.Prisma.Decimal(0);
        await tx.ledger_entries.createMany({ data: [{ transaction_id: transaction.id, wallet_id: payerWallet.id, entry_type: 'debit', amount: totalOut, balance_before: payerBalance, balance_after: payerBalance.minus(totalOut), description: `Payment via request from ${request.users_requester?.username}` }, { transaction_id: transaction.id, wallet_id: requesterWallet.id, entry_type: 'credit', amount: amount, balance_before: requesterBalance, balance_after: requesterBalance.plus(amount), description: 'Payment received from request' },] });
        await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'completed', processed_at: new Date() } });
        await tx.payment_requests.update({ where: { id: request.id }, data: { status: 'completed', transaction_id: transaction.id, accepted_at: new Date(), completed_at: new Date() } });
        return { requestId: request.id, data: { transaction_reference: reference, amount: amount, fee, status: 'completed', request_reference: request.request_reference }, message: 'Payment completed successfully', requesterUserId: request.requester_user_id };
    }
    async notifyCompletedTransfer(senderUserId, result, requestId) {
        await Promise.all([
            this.notificationsService.notifyTransfer(senderUserId, result.requesterUserId, Number(result.data.amount), result.data.transaction_reference),
            this.notificationsService.sendNotification(result.requesterUserId, {
                type: 'request_completed',
                entityId: requestId,
                title: 'Request Completed',
                body: 'Your payment request has been paid.',
            }),
        ]);
    }
    async rejectRequest(senderUserId, requestId) {
        const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
        if (!request)
            throw new common_1.NotFoundException('Payment request not found');
        if (request.recipient_user_id !== senderUserId)
            throw new common_1.ForbiddenException('You are not authorized for this request');
        if (request.status !== 'pending')
            throw new common_1.BadRequestException(`Request status is ${request.status}`);
        const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'rejected', rejected_at: new Date() } });
        await this.notificationsService.sendNotification(request.requester_user_id, {
            type: 'request_declined',
            entityId: request.id,
            title: 'Request Declined',
            body: 'Your payment request was declined.',
        });
        return { data: { status: 'rejected', request_reference: updated.request_reference }, message: 'Payment request rejected' };
    }
    async cancelRequest(requesterUserId, requestId) {
        const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId } });
        if (!request)
            throw new common_1.NotFoundException('Payment request not found');
        if (request.requester_user_id !== requesterUserId)
            throw new common_1.ForbiddenException('You are not authorized for this request');
        if (request.status !== 'pending')
            throw new common_1.BadRequestException(`Request status is ${request.status}`);
        const updated = await this.prisma.payment_requests.update({ where: { id: requestId }, data: { status: 'cancelled', updated_at: new Date() } });
        await this.notificationsService.sendNotification(request.requester_user_id, {
            type: 'request_declined',
            entityId: request.id,
            title: 'Payment Request Cancelled',
            body: 'Your payment request was cancelled.',
        });
        return { data: { status: 'cancelled', request_reference: updated.request_reference }, message: 'Payment request cancelled' };
    }
    async getRequestDetails(userId, requestId) {
        const request = await this.prisma.payment_requests.findUnique({ where: { id: requestId }, include: { users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } }, users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } }, transactions: { select: { transaction_reference: true, status: true } } } });
        if (!request)
            throw new common_1.NotFoundException('Payment request not found');
        if (request.recipient_user_id !== userId && request.requester_user_id !== userId)
            throw new common_1.ForbiddenException('Unauthorized to view this request');
        return { data: request };
    }
    async getMyRequestHistory(userId, query) {
        const { skip, take } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
        const requests = await this.prisma.payment_requests.findMany({ where: { OR: [{ requester_user_id: userId }, { recipient_user_id: userId }] }, include: { users_requester: { select: { id: true, username: true, first_name: true, last_name: true, profile_image: true } }, users_recipient: { select: { id: true, username: true, first_name: true, last_name: true } } }, orderBy: { created_at: 'desc' }, skip, take });
        const total = await this.prisma.payment_requests.count({ where: { OR: [{ requester_user_id: userId }, { recipient_user_id: userId }] } });
        return { data: requests, pagination: { total, page: query.page || 1, limit: query.limit || 10 } };
    }
};
exports.PaymentRequestsService = PaymentRequestsService;
exports.PaymentRequestsService = PaymentRequestsService = PaymentRequestsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        notifications_service_1.NotificationsService])
], PaymentRequestsService);
//# sourceMappingURL=payment-requests.service.js.map