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
var DepositService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const ivorypay_service_1 = require("../ivorypay/ivorypay.service");
const websocket_gateway_1 = require("../websocket/websocket.gateway");
const uuid_1 = require("uuid");
const cache_service_1 = require("../common/cache/cache.service");
const access_control_util_1 = require("../common/utils/access-control.util");
const notifications_service_1 = require("../notifications/notifications.service");
const currency_conversion_service_1 = require("../currency/currency-conversion.service");
let DepositService = DepositService_1 = class DepositService {
    constructor(prisma, paystack, ivorypay, websocket, cache, notificationsService, currencyConversionService) {
        this.prisma = prisma;
        this.paystack = paystack;
        this.ivorypay = ivorypay;
        this.websocket = websocket;
        this.cache = cache;
        this.notificationsService = notificationsService;
        this.currencyConversionService = currencyConversionService;
        this.logger = new common_1.Logger(DepositService_1.name);
    }
    async createDeposit(userId, dto) {
        const paymentMethod = (dto.paymentMethod ||
            dto.payment_method ||
            dto.method ||
            dto.payment_channel ||
            dto.payment_provider ||
            'CARD').toUpperCase();
        if (paymentMethod === 'CRYPTO') {
            this.logger.log(`DepositService: delegating crypto deposit to dedicated IvoryPay flow for user=${userId}`);
            throw new common_1.BadRequestException('Crypto deposits must use the dedicated /api/v1/crypto/deposit endpoint');
        }
        const amount = Number(dto.amount_fiat);
        if (!Number.isFinite(amount) || amount < 10) {
            throw new common_1.BadRequestException(`Invalid deposit amount. Minimum deposit is 10 ${dto.currency || 'KES'}`);
        }
        const reference = (0, uuid_1.v4)();
        const provider = 'paystack';
        const fee = 0;
        const total = amount;
        const depositCurrency = paymentMethod === 'CRYPTO' ? 'FARM' : dto.currency || 'KES';
        const depositAmount = amount;
        const depositFee = paymentMethod === 'CRYPTO' ? 0 : fee;
        const depositTotal = paymentMethod === 'CRYPTO' ? amount : total;
        let providerRef = reference;
        const deposit = await this.prisma.deposit.create({
            data: {
                userId,
                amount: depositAmount,
                fee: depositFee,
                total: depositTotal,
                currency: depositCurrency,
                paymentMethod,
                provider,
                reference,
                status: 'PENDING',
                providerRef,
            },
        });
        const createdAmount = deposit.amount;
        let paymentUrl = null;
        if (paymentMethod !== 'CRYPTO') {
            await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: total,
                    fee: 0,
                    net_amount: total,
                    currency: dto.currency || 'KES',
                    description: `Pending ${paymentMethod} deposit via ${provider.toUpperCase()} (${depositCurrency} ${total})`,
                    metadata: {
                        provider,
                        amount_fiat: amount,
                        currency_fiat: dto.currency || 'KES',
                        exchange_rate: 1,
                        user_id: userId,
                        payment_method: paymentMethod,
                        deposit_id: deposit.id,
                    },
                },
            });
        }
        if (paymentMethod === 'CRYPTO') {
            const farmAmount = depositAmount;
            const currentRate = await this.currencyConversionService.getCurrentRate();
            const farmToUsdRate = Number(currentRate.farm_usd_rate);
            const amountUsd = Number((farmAmount * farmToUsdRate).toFixed(2));
            if (!Number.isFinite(farmToUsdRate) || farmToUsdRate <= 0) {
                throw new common_1.BadRequestException('The FARM/USD conversion rate is unavailable');
            }
            const init = await this.ivorypay.createPayment({
                amount: amountUsd,
                currency: 'USD',
                reference,
                email: dto.email || `${userId}@farm.app`,
                description: `Farm deposit ${farmAmount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
                baseFiat: 'USD',
                metadata: {
                    provider: 'ivorypay',
                    amount_farm: farmAmount,
                    amount_usd: amountUsd,
                    farm_to_usd_rate: farmToUsdRate,
                    currency_fiat: 'USD',
                    user_id: userId,
                    payment_method: 'CRYPTO',
                },
            });
            providerRef = init.providerReference ?? init.data?.id ?? init.data?.reference ?? reference;
            if (providerRef !== reference) {
                await this.prisma.deposit.update({ where: { id: deposit.id }, data: { providerRef } });
            }
            paymentUrl = init.data?.payment_link || init.payment_link || init.checkout_url;
            await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: farmAmount,
                    fee: 0,
                    net_amount: farmAmount,
                    currency: 'FARM',
                    description: `Pending crypto deposit via Ivorypay (${farmAmount} FARM → ${amountUsd} USD)`,
                    metadata: {
                        provider: 'ivorypay',
                        provider_ref: providerRef,
                        amount_farm: farmAmount,
                        amount_usd: amountUsd,
                        farm_to_usd_rate: farmToUsdRate,
                        currency_fiat: 'USD',
                        user_id: userId,
                        payment_method: 'CRYPTO',
                    },
                },
            });
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_initiated',
                    entity_type: 'transaction',
                    entity_id: null,
                    new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm: farmAmount },
                },
            });
            return {
                data: {
                    provider: 'IVORYPAY',
                    reference,
                    payment_url: init.data?.payment_link || init.payment_link,
                    authorization_url: init.data?.payment_link || init.payment_link,
                },
                message: 'Crypto deposit initiated via Ivorypay',
            };
        }
        else if (paymentMethod === 'MOBILE_MONEY') {
            if (!dto.phone) {
                throw new common_1.BadRequestException('Phone number is required for mobile money deposits');
            }
            const init = await this.paystack.initializePayment({
                email: dto.email || `${userId}@farm.app`,
                amount: total,
                reference,
                currency: 'KES',
                channels: ['mobile_money'],
                phone: dto.phone,
                metadata: { userId, depositId: deposit.id, paymentMethod },
            });
            paymentUrl = init.authorization_url || init.authorizationUrl;
        }
        else if (paymentMethod === 'CARD') {
            const init = await this.paystack.initializePayment({
                email: dto.email || `${userId}@farm.app`,
                amount: total,
                reference,
                currency: 'KES',
                channels: ['card'],
                metadata: { userId, depositId: deposit.id, paymentMethod },
            });
            paymentUrl = init.authorization_url || init.authorizationUrl;
        }
        else if (paymentMethod === 'BANK_TRANSFER') {
            const init = await this.paystack.initializePayment({
                email: dto.email || `${userId}@farm.app`,
                amount: total,
                reference,
                currency: 'KES',
                channels: ['bank_transfer'],
                metadata: { userId, depositId: deposit.id, paymentMethod },
            });
            paymentUrl = init.authorization_url || init.authorizationUrl;
        }
        else {
            throw new common_1.BadRequestException(`Unsupported payment method ${paymentMethod}`);
        }
        return {
            success: true,
            payment_url: paymentUrl,
            authorization_url: paymentUrl,
            reference,
            deposit,
        };
    }
    async getUserDeposits(userId) {
        const deposits = await this.prisma.deposit.findMany({
            where: { userId, status: 'SUCCESS' },
            orderBy: { createdAt: 'desc' },
        });
        if (deposits.length === 0) {
            return { success: true, data: deposits };
        }
        const references = deposits.map((deposit) => deposit.reference);
        const transactions = await this.prisma.transactions.findMany({
            where: { transaction_reference: { in: references } },
            select: { transaction_reference: true, amount: true, currency: true, metadata: true },
        });
        const transactionByReference = new Map(transactions.map((transaction) => [transaction.transaction_reference, transaction]));
        return {
            success: true,
            data: deposits.map((deposit) => {
                const transaction = transactionByReference.get(deposit.reference);
                const metadata = transaction?.metadata ?? {};
                return {
                    ...deposit,
                    amount_farm: metadata.amount_farm ?? (transaction?.currency === 'FARM' ? transaction.amount : null),
                    amount_usd: metadata.amount_usd ?? null,
                    farm_to_usd_rate: metadata.farm_to_usd_rate ?? null,
                    metadata: {
                        ...metadata,
                        payment_method: metadata.payment_method ?? deposit.paymentMethod,
                        currency_fiat: metadata.currency_fiat ?? deposit.currency,
                    },
                };
            }),
        };
    }
    async getWalletBalance(userId) {
        const wallet = await this.prisma.wallets.findFirst({
            where: { user_id: userId, is_active: true },
        });
        return { balance: wallet?.balance ?? 0, locked_balance: wallet?.locked_balance ?? 0 };
    }
    async getDepositById(id, userId) {
        const deposit = await this.prisma.deposit.findUnique({ where: { id } });
        if (!deposit)
            return null;
        (0, access_control_util_1.assertResourceAccess)(deposit.userId, userId, 'deposit');
        if (deposit.status !== 'SUCCESS')
            return null;
        return deposit;
    }
    async finalizeSuccessfulDeposit(reference) {
        this.logger.log(`finalizeSuccessfulDeposit: start for reference=${reference}`);
        let deposit = await this.prisma.deposit.findFirst({ where: { reference } });
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (!transaction) {
            throw new common_1.BadRequestException(`Transaction not found for reference: ${reference}`);
        }
        try {
            const metadata = transaction.metadata ?? {};
            const provider = (metadata?.provider?.toString()?.toLowerCase() || deposit?.provider?.toLowerCase() || 'unknown').trim();
            if (provider === 'paystack') {
                try {
                    const verified = await this.paystack.verifyTransaction(reference);
                    if (!verified || (verified.status ?? '').toString().toLowerCase() !== 'success') {
                        this.logger.warn(`finalizeSuccessfulDeposit: paystack verify indicates non-success for ${reference} status=${verified?.status ?? 'unknown'} - aborting credit`);
                        return false;
                    }
                }
                catch (e) {
                    this.logger.warn(`finalizeSuccessfulDeposit: paystack verify failed for ${reference} - aborting credit`, e);
                    return false;
                }
            }
        }
        catch (e) {
            this.logger.debug('finalizeSuccessfulDeposit: provider verification skipped due to error', e);
        }
        if (!deposit && transaction?.amount) {
            const metadata = transaction.metadata;
            const userId = metadata?.user_id;
            const paymentMethod = metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'CRYPTO' : 'CARD';
            if (!userId) {
                this.logger.warn(`Deposit missing for reference ${reference} but transaction metadata.user_id is unavailable`);
            }
            else {
                this.logger.warn(`Deposit missing for reference ${reference}, reconstructing from transaction`);
                deposit = await this.prisma.deposit.create({
                    data: {
                        reference,
                        amount: Number(transaction.amount),
                        fee: 0,
                        total: Number(transaction.amount),
                        currency: transaction.currency || 'FARM',
                        paymentMethod,
                        provider: metadata?.provider?.toString()?.toLowerCase() === 'ivorypay' ? 'ivorypay' : 'paystack',
                        status: 'PENDING',
                        userId,
                    },
                });
            }
        }
        const depositPending = !!deposit && deposit.status === 'PENDING';
        const depositComplete = !!deposit && deposit.status === 'SUCCESS';
        const isDeposit = transaction.transaction_type?.toLowerCase() === 'deposit';
        const txStatus = transaction.status?.toLowerCase();
        const txPending = isDeposit && ['pending', 'processing'].includes(txStatus ?? '');
        const txComplete = isDeposit && txStatus === 'completed';
        const txFailed = isDeposit && ['failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');
        const txUnknown = isDeposit && !['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed', 'abandoned', 'expired', 'incomplete', 'declined'].includes(txStatus ?? '');
        if (txFailed || txUnknown) {
            this.logger.warn(`finalizeSuccessfulDeposit: transaction ${reference} status=${transaction.status} - not crediting wallet`);
            return false;
        }
        if (depositComplete && txComplete) {
            this.logger.log(`finalizeSuccessfulDeposit: already completed for ${reference}`);
            return true;
        }
        if (depositPending && txPending) {
            return this.finalizePendingDepositWithTransaction(reference, deposit, transaction);
        }
        if (depositPending) {
            return this.creditPendingDepositWithWallet(reference, deposit, transaction);
        }
        if (depositComplete && txPending) {
            return this.completePendingTransaction(reference, transaction);
        }
        if (txPending) {
            return this.creditPendingTransactionDeposit(reference);
        }
        this.logger.warn(`finalizeSuccessfulDeposit: transaction ${reference} status=${transaction.status} is not eligible for wallet credit`);
        return false;
    }
    async failDeposit(reference, reason) {
        const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (!deposit && !transaction) {
            this.logger.warn(`failDeposit: no deposit or transaction found for reference=${reference}`);
            return false;
        }
        const metadata = transaction?.metadata ?? {};
        const failureMetadata = {
            ...metadata,
            failure_reason: reason ?? metadata.failure_reason,
        };
        await this.prisma.$transaction(async (tx) => {
            if (deposit && deposit.status === 'PENDING') {
                await tx.deposit.update({ where: { id: deposit.id }, data: { status: 'FAILED' } });
            }
            if (transaction && !['failed', 'cancelled', 'completed'].includes(transaction.status?.toLowerCase() ?? '')) {
                await tx.transactions.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'failed',
                        processed_at: new Date(),
                        metadata: failureMetadata,
                    },
                });
            }
        });
        this.logger.log(`failDeposit: marked ${reference} as failed${reason ? ` reason=${reason}` : ''}`);
        try {
            const metadata2 = transaction?.metadata ?? {};
            const userId = deposit?.userId ?? metadata2?.user_id;
            if (userId) {
                this.websocket.emitTransactionUpdate(userId, {
                    reference,
                    status: 'FAILED',
                    reason: failureMetadata.failure_reason ?? reason,
                });
                await this.notificationsService.sendNotification(userId, {
                    type: 'transaction',
                    title: 'Deposit failed',
                    body: reason ? `Your deposit could not be completed: ${reason}` : 'Your deposit could not be completed.',
                    entityId: reference,
                    metadata: { reference },
                });
            }
        }
        catch (e) {
            this.logger.debug('Failed to emit websocket update for failed deposit', e);
        }
        return true;
    }
    async finalizePendingDepositWithTransaction(reference, deposit, transaction) {
        if (!transaction || !transaction.id) {
            throw new common_1.BadRequestException(`Invalid transaction for deposit finalization: reference=${reference}`);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            let wallet = await tx.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
            if (!wallet) {
                wallet = await tx.wallets.create({
                    data: {
                        user_id: deposit.userId,
                        wallet_name: 'Main Wallet',
                        wallet_type: 'user',
                        wallet_address: (0, uuid_1.v4)(),
                        currency: deposit.currency || 'FARM',
                    },
                });
            }
            const updatedDeposit = await tx.deposit.updateMany({
                where: { id: deposit.id, status: 'PENDING' },
                data: { status: 'SUCCESS' },
            });
            if (updatedDeposit.count === 0) {
                return { ok: false };
            }
            const amount = this.normalizeAmount(Number(deposit.amount));
            const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
            await tx.wallets.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });
            await tx.ledger_entries.create({
                data: {
                    transaction_id: transaction.id,
                    wallet_id: wallet.id,
                    entry_type: 'credit',
                    amount,
                    balance_before: previousBalance,
                    balance_after: previousBalance + amount,
                    description: `Deposit completed — ref: ${reference}`,
                },
            });
            if (transaction.status?.toLowerCase() !== 'completed') {
                await tx.transactions.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'completed',
                        receiver_wallet_id: transaction.receiver_wallet_id ?? wallet.id,
                        processed_at: new Date(),
                    },
                });
            }
            return { ok: true };
        });
        if (result.ok) {
            await this.invalidateFinancialCaches(deposit?.userId);
        }
        return result.ok;
    }
    async completePendingTransaction(reference, transaction) {
        if (!transaction) {
            this.logger.warn(`Transaction not found for reference: ${reference}`);
            return false;
        }
        const txStatus = transaction.status?.toLowerCase();
        if (txStatus === 'completed') {
            return true;
        }
        if (!['pending', 'processing'].includes(txStatus ?? '')) {
            this.logger.warn(`completePendingTransaction: transaction ${reference} status=${transaction.status} cannot be completed automatically`);
            return false;
        }
        const updates = {
            status: 'completed',
            processed_at: new Date(),
        };
        if (!transaction.receiver_wallet_id) {
            const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
            if (deposit) {
                const wallet = await this.prisma.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
                if (wallet)
                    updates.receiver_wallet_id = wallet.id;
            }
        }
        await this.prisma.transactions.update({
            where: { id: transaction.id },
            data: updates,
        });
        await this.invalidateFinancialCaches(transaction?.metadata?.user_id ?? undefined);
        return true;
    }
    async creditPendingTransactionDeposit(reference) {
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (!transaction) {
            this.logger.warn(`Transaction not found for reference: ${reference}`);
            return false;
        }
        const isDeposit = transaction.transaction_type?.toLowerCase() === 'deposit';
        if (!isDeposit)
            return false;
        const txStatus = transaction.status?.toLowerCase();
        if (txStatus === 'completed')
            return true;
        if (!['pending', 'processing'].includes(txStatus ?? '')) {
            this.logger.warn(`creditPendingTransactionDeposit: transaction ${reference} status=${transaction.status} is not eligible for credit`);
            return false;
        }
        const result = await this.prisma.$transaction(async (tx) => {
            let wallet = transaction.receiver_wallet_id
                ? await tx.wallets.findUnique({ where: { id: transaction.receiver_wallet_id } })
                : null;
            const metadata = transaction.metadata;
            const userId = metadata?.user_id;
            if (!wallet && userId) {
                wallet = await tx.wallets.findFirst({ where: { user_id: userId, is_active: true } });
            }
            if (!wallet && userId) {
                wallet = await tx.wallets.create({
                    data: {
                        user_id: userId,
                        wallet_name: 'Main Wallet',
                        wallet_type: 'user',
                        wallet_address: (0, uuid_1.v4)(),
                        currency: transaction.currency || 'FARM',
                    },
                });
            }
            if (!wallet)
                return { ok: false };
            const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
            const amount = this.normalizeAmount(Number(transaction.amount));
            const updated = await tx.transactions.updateMany({
                where: { id: transaction.id, status: { not: 'completed' } },
                data: {
                    status: 'completed',
                    receiver_wallet_id: wallet.id,
                    processed_at: new Date(),
                },
            });
            if (updated.count === 0)
                return { ok: false };
            await tx.wallets.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });
            await tx.ledger_entries.create({
                data: {
                    transaction_id: transaction.id,
                    wallet_id: wallet.id,
                    entry_type: 'credit',
                    amount,
                    balance_before: previousBalance,
                    balance_after: previousBalance + amount,
                    description: `Deposit completed — ref: ${reference}`,
                },
            });
            return { ok: true };
        });
        if (result.ok) {
            const metadata = transaction?.metadata ?? {};
            await this.invalidateFinancialCaches(metadata?.user_id ?? undefined);
            if (metadata?.user_id) {
                await this.notificationsService.sendNotification(metadata.user_id, {
                    type: 'deposit_completed',
                    title: 'Deposit completed',
                    body: `Your deposit of ${Number(transaction.amount ?? 0)} ${transaction.currency || 'FARM'} has been credited to your wallet.`,
                    entityId: transaction.id,
                    metadata: { reference, amount: Number(transaction.amount ?? 0), currency: transaction.currency || 'FARM' },
                });
            }
        }
        return result.ok;
    }
    async creditPendingDepositWithWallet(reference, deposit, transaction) {
        if (!deposit || deposit.status !== 'PENDING') {
            this.logger.warn(`creditPendingDepositWithWallet: deposit not in PENDING state for ${reference}`);
            return false;
        }
        if (!transaction) {
            transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        }
        if (!transaction || transaction.status?.toLowerCase() !== 'pending') {
            this.logger.warn(`creditPendingDepositWithWallet: invalid transaction state for ${reference}. ` +
                `Transaction: ${transaction ? `exists, status=${transaction.status}` : 'missing'}`);
            return false;
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.deposit.updateMany({
                where: { id: deposit.id, status: 'PENDING' },
                data: { status: 'SUCCESS' },
            });
            if (updated.count === 0)
                return { ok: false };
            let wallet = await tx.wallets.findFirst({ where: { user_id: deposit.userId, is_active: true } });
            if (!wallet) {
                wallet = await tx.wallets.create({
                    data: {
                        user_id: deposit.userId,
                        wallet_name: 'Main Wallet',
                        wallet_type: 'user',
                        wallet_address: (0, uuid_1.v4)(),
                        currency: deposit.currency || 'FARM',
                    },
                });
            }
            const previousBalance = this.normalizeAmount(Number(wallet.balance ?? 0));
            const amount = this.normalizeAmount(Number(deposit.amount));
            await tx.wallets.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });
            await tx.ledger_entries.create({
                data: {
                    transaction_id: transaction.id,
                    wallet_id: wallet.id,
                    entry_type: 'credit',
                    amount,
                    balance_before: previousBalance,
                    balance_after: previousBalance + amount,
                    description: `Deposit completed — ref: ${reference}`,
                },
            });
            if (transaction.status?.toLowerCase() !== 'completed') {
                await tx.transactions.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'completed',
                        receiver_wallet_id: wallet.id,
                        processed_at: new Date(),
                    },
                });
            }
            return { ok: true };
        });
        if (result.ok) {
            await this.invalidateFinancialCaches(deposit?.userId);
            if (deposit?.userId) {
                await this.notificationsService.sendNotification(deposit.userId, {
                    type: 'deposit_completed',
                    title: 'Deposit completed',
                    body: `Your deposit of ${Number(deposit.amount ?? 0)} ${deposit.currency || 'FARM'} has been credited to your wallet.`,
                    entityId: deposit.id,
                    metadata: { amount: Number(deposit.amount ?? 0), currency: deposit.currency || 'FARM' },
                });
            }
        }
        return result.ok;
    }
    async invalidateFinancialCaches(userId) {
        if (!userId)
            return;
        await Promise.all([
            this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`),
            this.cache.cacheInvalidatePattern(`dashboard:${userId}`),
            this.cache.cacheInvalidatePattern(`transactions:${userId}:*`),
            this.cache.cacheDelete('admin:dashboard:stats'),
            this.cache.cacheDelete('admin:analytics'),
            this.cache.cacheDelete('admin:superadmin-dashboard'),
        ]);
    }
    normalizeAmount(amount) {
        const n = Number(amount ?? 0);
        if (!isFinite(n))
            return 0;
        return Math.round(n * 100) / 100;
    }
};
exports.DepositService = DepositService;
exports.DepositService = DepositService = DepositService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        paystack_service_1.PaystackService,
        ivorypay_service_1.IvorypayService,
        websocket_gateway_1.WebsocketGateway,
        cache_service_1.CacheService,
        notifications_service_1.NotificationsService,
        currency_conversion_service_1.CurrencyConversionService])
], DepositService);
//# sourceMappingURL=deposit.service.js.map