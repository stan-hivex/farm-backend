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
var IvorypayDepositService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IvorypayDepositService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const ivorypay_service_1 = require("./ivorypay.service");
const notifications_service_1 = require("../notifications/notifications.service");
const websocket_gateway_1 = require("../websocket/websocket.gateway");
const uuid_1 = require("uuid");
const currency_conversion_service_1 = require("../currency/currency-conversion.service");
let IvorypayDepositService = IvorypayDepositService_1 = class IvorypayDepositService {
    constructor(prisma, ivorypayService, notificationsService, websocket, currencyConversionService) {
        this.prisma = prisma;
        this.ivorypayService = ivorypayService;
        this.notificationsService = notificationsService;
        this.websocket = websocket;
        this.currencyConversionService = currencyConversionService;
        this.logger = new common_1.Logger(IvorypayDepositService_1.name);
    }
    async createDeposit(userId, dto) {
        const amount = Number(dto.amount_fiat);
        if (!Number.isFinite(amount) || amount < 10) {
            throw new common_1.BadRequestException(`Invalid deposit amount. Minimum deposit is 10 ${dto.currency || 'KES'}`);
        }
        const reference = (0, uuid_1.v4)();
        const deposit = await this.prisma.deposit.create({
            data: {
                userId,
                amount,
                fee: 0,
                total: amount,
                currency: 'FARM',
                paymentMethod: 'CRYPTO',
                provider: 'ivorypay',
                reference,
                status: 'PENDING',
                providerRef: reference,
            },
        });
        const currentRate = await this.currencyConversionService.getCurrentRate();
        const farmToUsdRate = Number(currentRate.farm_usd_rate);
        if (!Number.isFinite(farmToUsdRate) || farmToUsdRate <= 0) {
            throw new common_1.BadRequestException('The FARM/USD conversion rate is unavailable');
        }
        const amountUsd = Number((amount * farmToUsdRate).toFixed(2));
        const usdToFarmRate = Number((1 / farmToUsdRate).toFixed(8));
        const init = await this.ivorypayService.createPayment({
            amount: amountUsd,
            currency: 'USD',
            reference,
            email: dto.email || `${userId}@farm.app`,
            description: `Farm deposit ${amount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
            baseFiat: 'USD',
            metadata: {
                provider: 'ivorypay',
                amount_farm: amount,
                amount_usd: amountUsd,
                farm_to_usd_rate: farmToUsdRate,
                usd_to_farm_rate: usdToFarmRate,
                currency_fiat: 'USD',
                user_id: userId,
                payment_method: 'CRYPTO',
            },
        });
        const providerRef = init.providerReference ?? init.data?.id ?? init.data?.reference ?? reference;
        await this.prisma.deposit.update({ where: { id: deposit.id }, data: { providerRef } });
        await this.prisma.transactions.create({
            data: {
                transaction_reference: reference,
                transaction_type: 'deposit',
                status: 'pending',
                amount,
                fee: 0,
                net_amount: amount,
                currency: 'FARM',
                description: `Pending crypto deposit via Ivorypay (${amount} FARM → ${amountUsd} USD)`,
                metadata: {
                    provider: 'ivorypay',
                    provider_ref: providerRef,
                    amount_farm: amount,
                    amount_usd: amountUsd,
                    farm_to_usd_rate: farmToUsdRate,
                    usd_to_farm_rate: usdToFarmRate,
                    currency_fiat: 'USD',
                    user_id: userId,
                    payment_method: 'CRYPTO',
                },
            },
        });
        this.logger.log(`IvoryPay deposit created: reference=${reference} user=${userId}`);
        return {
            success: true,
            data: {
                reference,
                payment_url: init.data?.payment_link || init.payment_link || init.checkout_url,
                authorization_url: init.data?.payment_link || init.payment_link || init.checkout_url,
            },
            message: 'Crypto deposit initiated via IvoryPay',
        };
    }
    async getStatus(reference) {
        const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
        if (!deposit) {
            throw new common_1.BadRequestException('Deposit not found');
        }
        return { success: true, data: { reference, status: deposit.status, provider: deposit.provider } };
    }
    async handleWebhook(payload, verified = false) {
        const reference = this.resolveReference(payload);
        if (!reference) {
            this.logger.warn('IvoryPay webhook received without reference');
            throw new common_1.BadRequestException('Missing IvoryPay reference');
        }
        this.logger.log(`IvoryPay webhook received: reference=${reference} event=${payload.event ?? payload.status}`);
        if (!verified) {
            this.logger.warn(`IvoryPay webhook verification skipped for ${reference}`);
            throw new common_1.BadRequestException('Signature verification required');
        }
        const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        if (!deposit || !transaction) {
            this.logger.warn(`IvoryPay webhook ignored: deposit/transaction not found for ${reference}`);
            return { processed: false, reason: 'not_found' };
        }
        try {
            const providerId = payload?.id || payload?.data?.id || payload?.data?.transaction_id || payload?.data?.payment_id || null;
            if (providerId && deposit.providerRef !== providerId) {
                const metadata = transaction.metadata ?? {};
                const updatedMetadata = { ...metadata, provider_ref: providerId };
                await this.prisma.$transaction(async (tx) => {
                    await tx.deposit.update({ where: { id: deposit.id }, data: { providerRef: providerId } });
                    await tx.transactions.update({ where: { id: transaction.id }, data: { metadata: updatedMetadata } });
                });
                deposit.providerRef = providerId;
                transaction.metadata = updatedMetadata;
                this.logger.log(`IvoryPay webhook: synced provider id ${providerId} into deposit and transaction for ${reference}`);
            }
        }
        catch (e) {
            this.logger.debug(`IvoryPay webhook: failed to sync provider id for ${reference}`, e);
        }
        const depositStatus = deposit.status?.toString().toUpperCase();
        const txStatus = transaction.status?.toString().toLowerCase();
        const isSuccess = this.isSuccess(payload);
        const isFailure = this.isFailure(payload);
        if (depositStatus === 'SUCCESS' || txStatus === 'completed') {
            this.logger.log(`IvoryPay duplicate webhook ignored for ${reference}`);
            return { processed: true, duplicate: true, reference };
        }
        if (!isSuccess && !isFailure) {
            this.logger.log(`IvoryPay webhook ignored for ${reference}: unsupported event`);
            return { processed: false, reason: 'unsupported_event' };
        }
        if (isFailure) {
            await this.prisma.deposit.update({ where: { id: deposit.id }, data: { status: 'FAILED' } });
            await this.prisma.transactions.update({ where: { id: transaction.id }, data: { status: 'failed' } });
            this.logger.warn(`IvoryPay deposit marked failed: reference=${reference}`);
            return { processed: true, reference, status: 'failed' };
        }
        let verifiedTransaction;
        try {
            const transactionMetadata = transaction.metadata ?? {};
            verifiedTransaction = await this.ivorypayService.verifyTransaction(reference, deposit.providerRef ?? undefined, [transactionMetadata.provider_ref].filter((value) => typeof value === 'string' && value.length > 0));
        }
        catch (error) {
            this.logger.warn(`IvoryPay deposit verification failed for ${reference}: ${error instanceof Error ? error.message : String(error)}`);
            return { processed: false, reason: 'provider_verification_failed', reference };
        }
        const verifiedStatus = verifiedTransaction?.status?.toString().toUpperCase();
        if (verifiedStatus !== 'SUCCESS' && verifiedStatus !== 'COMPLETED') {
            this.logger.warn(`IvoryPay deposit verification is not successful for ${reference}: status=${verifiedStatus ?? 'unknown'}`);
            return { processed: false, reason: 'provider_not_successful', reference, status: verifiedStatus };
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const currentDeposit = await tx.deposit.findFirst({ where: { reference } });
            if (!currentDeposit) {
                throw new common_1.BadRequestException('Deposit missing during IvoryPay processing');
            }
            if (currentDeposit.status === 'SUCCESS') {
                return { alreadyProcessed: true };
            }
            let wallet = await tx.wallets.findFirst({ where: { user_id: currentDeposit.userId, is_active: true } });
            if (!wallet) {
                wallet = await tx.wallets.create({
                    data: {
                        user_id: currentDeposit.userId,
                        wallet_name: 'Main Wallet',
                        wallet_type: 'user',
                        wallet_address: (0, uuid_1.v4)(),
                        currency: currentDeposit.currency || 'FARM',
                    },
                });
            }
            const previousBalance = Number(wallet.balance ?? 0);
            const creditAmount = Number(currentDeposit.amount ?? transaction.amount ?? 0);
            await tx.deposit.update({ where: { id: currentDeposit.id }, data: { status: 'SUCCESS' } });
            await tx.wallets.update({ where: { id: wallet.id }, data: { balance: { increment: creditAmount } } });
            await tx.transactions.update({ where: { id: transaction.id }, data: { status: 'completed', receiver_wallet_id: wallet.id, processed_at: new Date() } });
            await tx.ledger_entries.create({
                data: {
                    transaction_id: transaction.id,
                    wallet_id: wallet.id,
                    entry_type: 'credit',
                    amount: creditAmount,
                    balance_before: previousBalance,
                    balance_after: previousBalance + creditAmount,
                    description: `Deposit completed — ref: ${reference}`,
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: currentDeposit.userId,
                    action: 'deposit_completed',
                    entity_type: 'deposit',
                    entity_id: currentDeposit.id,
                    new_values: { reference, provider: 'ivorypay', amount: creditAmount },
                },
            });
            return { alreadyProcessed: false, wallet, previousBalance, creditAmount };
        });
        if (result.alreadyProcessed) {
            this.logger.log(`IvoryPay duplicate webhook ignored for ${reference}`);
            return { processed: true, duplicate: true, reference };
        }
        await this.notificationsService.sendNotification(deposit.userId, {
            type: 'deposit_completed',
            title: 'Deposit completed',
            body: `Your crypto deposit of ${Number(deposit.amount ?? 0)} FARM has been credited to your wallet.`,
            entityId: deposit.id,
            metadata: { provider: 'ivorypay', reference },
        });
        this.websocket.emitBalanceUpdate(deposit.userId, (result.previousBalance ?? 0) + (result.creditAmount ?? 0));
        this.websocket.emitTransactionUpdate(deposit.userId, { reference, status: 'SUCCESS' });
        this.logger.log(`IvoryPay wallet credited: reference=${reference} amount=${result.creditAmount}`);
        return { processed: true, reference, status: 'completed' };
    }
    resolveReference(payload) {
        const value = payload?.reference || payload?.data?.reference || payload?.data?.tx_ref || payload?.data?.trxref || payload?.data?.transaction_reference || payload?.id;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }
    isSuccess(payload) {
        const event = payload?.event?.toString().toLowerCase() || '';
        const status = payload?.status?.toString().toLowerCase() || payload?.data?.status?.toString().toLowerCase() || '';
        return ['payment.success', 'transaction.completed', 'success', 'completed'].includes(event) || ['success', 'completed'].includes(status);
    }
    isFailure(payload) {
        const event = payload?.event?.toString().toLowerCase() || '';
        const status = payload?.status?.toString().toLowerCase() || payload?.data?.status?.toString().toLowerCase() || '';
        return ['payment.failed', 'transaction.failed', 'failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'].includes(event) || ['failed', 'cancelled', 'expired', 'abandoned', 'declined', 'reversed', 'incomplete'].includes(status);
    }
};
exports.IvorypayDepositService = IvorypayDepositService;
exports.IvorypayDepositService = IvorypayDepositService = IvorypayDepositService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ivorypay_service_1.IvorypayService,
        notifications_service_1.NotificationsService,
        websocket_gateway_1.WebsocketGateway,
        currency_conversion_service_1.CurrencyConversionService])
], IvorypayDepositService);
//# sourceMappingURL=ivorypay-deposit.service.js.map