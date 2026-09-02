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
var WithdrawService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const security_service_1 = require("../security/security.service");
const paystack_service_1 = require("../paystack/paystack.service");
const ivorypay_service_1 = require("../ivorypay/ivorypay.service");
const uuid_1 = require("uuid");
const cache_service_1 = require("../common/cache/cache.service");
const access_control_util_1 = require("../common/utils/access-control.util");
const notifications_service_1 = require("../notifications/notifications.service");
const currency_conversion_service_1 = require("../currency/currency-conversion.service");
let WithdrawService = WithdrawService_1 = class WithdrawService {
    constructor(prisma, authService, securityService, paystack, ivorypay, cache, notificationsService, currencyConversionService) {
        this.prisma = prisma;
        this.authService = authService;
        this.securityService = securityService;
        this.paystack = paystack;
        this.ivorypay = ivorypay;
        this.cache = cache;
        this.notificationsService = notificationsService;
        this.currencyConversionService = currencyConversionService;
        this.logger = new common_1.Logger(WithdrawService_1.name);
    }
    async createWithdrawal(userId, dto) {
        if (dto.biometric_auth) {
            const deviceFingerprint = dto.device_fingerprint || dto.deviceFingerprint;
            if (!deviceFingerprint)
                throw new common_1.BadRequestException('Device fingerprint required for biometric authorization');
            const verified = await this.securityService.verifyDevice(userId, deviceFingerprint);
            if (!verified || verified.trusted !== true) {
                throw new common_1.BadRequestException('Biometric device verification failed');
            }
        }
        else {
            if (!dto.pin)
                throw new common_1.BadRequestException('Transaction PIN is required');
            await this.authService.verifyPin(userId, dto.pin);
        }
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new common_1.BadRequestException('Invalid withdrawal amount');
        }
        const cryptoAddress = dto.cryptoAddress ?? dto.walletAddress ?? dto.walletaddress ?? dto.wallet_address;
        const cryptoAsset = dto.cryptoAsset ?? dto.token;
        const normalizedNetwork = dto.network?.trim();
        const method = dto.method;
        if (method === 'BANK_TRANSFER') {
            if (amount < 4999) {
                throw new common_1.BadRequestException('Minimum withdrawal amount for bank transfer is 4,999 FARM');
            }
            if (amount > 999999) {
                throw new common_1.BadRequestException('Maximum withdrawal amount for bank transfer is 999,999 FARM');
            }
        }
        else if (method === 'MOBILE_MONEY') {
            if (amount < 1499) {
                throw new common_1.BadRequestException('Minimum withdrawal amount for mobile money is 1,499 FARM');
            }
            if (amount > 249999) {
                throw new common_1.BadRequestException('Maximum withdrawal amount for mobile money is 249,999 FARM');
            }
        }
        else if (method === 'CRYPTO') {
            if (amount < 100) {
                throw new common_1.BadRequestException('Minimum withdrawal amount for crypto is 100 FARM');
            }
        }
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
        if (!wallet) {
            throw new common_1.BadRequestException('Active wallet not found');
        }
        const availableBalance = Number(wallet.balance ?? 0) - Number(wallet.locked_balance ?? 0);
        if (availableBalance < amount) {
            throw new common_1.BadRequestException('Insufficient balance for this withdrawal');
        }
        if (dto.method === 'MOBILE_MONEY') {
            if (!dto.phoneNumber) {
                throw new common_1.BadRequestException('Phone number is required for mobile money withdrawals');
            }
        }
        else if (dto.method === 'BANK_TRANSFER') {
            if (!dto.accountName || !dto.accountNumber || !dto.bankName) {
                throw new common_1.BadRequestException('Account name, account number and bank name are required for bank transfer withdrawals');
            }
        }
        else if (dto.method === 'CRYPTO') {
            if (!cryptoAddress || !cryptoAsset || !normalizedNetwork) {
                throw new common_1.BadRequestException('Crypto asset, address and network are required for cryptocurrency withdrawals');
            }
        }
        else {
            throw new common_1.BadRequestException(`Unsupported withdrawal method: ${dto.method}`);
        }
        const feePercent = 0.015;
        const fee = Number((amount * feePercent).toFixed(8));
        const settlement = Number((amount - fee).toFixed(8));
        const reference = (0, uuid_1.v4)();
        const normalizedNetworkValue = dto.method === 'CRYPTO'
            ? (normalizedNetwork ? normalizedNetwork.toUpperCase() : dto.network ?? '')
            : dto.network ?? '';
        const normalizedCryptoAsset = dto.method === 'CRYPTO'
            ? (cryptoAsset ? cryptoAsset.toUpperCase() : (dto.cryptoAsset ?? ''))
            : (dto.cryptoAsset ?? '');
        let cryptoExchangeSnapshot = null;
        if (dto.method === 'CRYPTO') {
            const rate = await this.currencyConversionService.getCurrentRate();
            const farmUsdRate = Number(rate.farm_usd_rate ?? 0);
            const farmKesRate = Number(rate.farm_kes_rate ?? 1);
            const usdKesRate = Number(rate.usd_kes_rate ?? 150);
            const cryptoAmount = Number((settlement * farmUsdRate).toFixed(8));
            const amountUsd = Number((amount * farmUsdRate).toFixed(8));
            const feeUsd = Number((fee * farmUsdRate).toFixed(8));
            const settlementUsd = Number((settlement * farmUsdRate).toFixed(8));
            cryptoExchangeSnapshot = {
                farmAmount: amount,
                farmKesRate,
                usdKesRate,
                farmUsdRate,
                cryptoCurrency: normalizedCryptoAsset,
                cryptoAmount,
                network: normalizedNetworkValue,
                conversionTimestamp: new Date().toISOString(),
                amount_farm: amount,
                fee_farm: fee,
                settlement_farm: settlement,
                amount_usd: amountUsd,
                fee_usd: feeUsd,
                settlement_usd: settlementUsd,
                crypto_asset: normalizedCryptoAsset,
            };
        }
        const withdrawal = await this.prisma.$transaction(async (tx) => {
            await tx.wallets.update({
                where: { id: wallet.id },
                data: { locked_balance: { increment: amount } },
            });
            const created = await tx.withdrawal.create({
                data: {
                    userId,
                    amount,
                    fee,
                    settlement,
                    total: amount,
                    currency: 'FARM',
                    method: dto.method,
                    accountName: dto.accountName,
                    accountNumber: dto.accountNumber,
                    bankName: dto.bankName,
                    phoneNumber: dto.phoneNumber,
                    cryptoAddress,
                    cryptoAsset: normalizedCryptoAsset,
                    network: normalizedNetworkValue,
                    reference,
                    status: 'PENDING',
                },
            });
            await tx.transactions.create({
                data: {
                    transaction_reference: reference,
                    sender_wallet_id: wallet.id,
                    transaction_type: 'withdrawal',
                    status: 'pending',
                    amount,
                    fee,
                    net_amount: settlement,
                    currency: 'FARM',
                    description: 'Pending withdrawal',
                    metadata: {
                        method: dto.method,
                        provider: dto.method === 'CRYPTO' ? 'ivorypay' : 'paystack',
                        user_id: userId,
                        reference,
                        cryptoAsset: normalizedCryptoAsset,
                        network: normalizedNetworkValue,
                        conversion_snapshot: cryptoExchangeSnapshot,
                    },
                },
            });
            return created;
        });
        setImmediate(() => this.processWithdrawal(reference).catch((error) => this.logger.error(error?.message ?? error)));
        await this.cache.cacheInvalidatePattern(`wallet:${userId}:balance`);
        await this.cache.cacheInvalidatePattern(`dashboard:${userId}`);
        await this.cache.cacheInvalidatePattern(`transactions:${userId}:*`);
        return { success: true, reference, withdrawal };
    }
    async getUserWithdrawals(userId) {
        return this.prisma.withdrawal.findMany({
            where: { userId, status: { not: 'FAILED' } },
            orderBy: { createdAt: 'desc' },
        });
    }
    getProviderNetworks(token) {
        return this.ivorypay.getProviderNetworks(token);
    }
    async getWithdrawal(id, userId) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
        if (!withdrawal) {
            return null;
        }
        (0, access_control_util_1.assertResourceAccess)(withdrawal.userId, userId, 'withdrawal');
        return withdrawal;
    }
    async getWithdrawalStatus(reference, userId) {
        const withdrawal = await this.prisma.withdrawal.findFirst({
            where: { reference, userId },
        });
        if (!withdrawal) {
            return null;
        }
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        const metadata = transaction?.metadata ?? {};
        const statusResult = {
            reference,
            withdrawal_status: withdrawal.status,
            provider: metadata.provider ?? (withdrawal.method === 'CRYPTO' ? 'ivorypay' : 'paystack'),
            method: withdrawal.method,
            amount: withdrawal.amount,
            currency: withdrawal.currency,
            rejection_reason: withdrawal.rejectionReason,
        };
        if (withdrawal.method === 'CRYPTO') {
            statusResult.ivorypay_withdrawal_id = metadata.ivorypay_withdrawal_id;
            statusResult.ivorypay_withdrawal_status = metadata.ivorypay_withdrawal_status;
            statusResult.ivorypay_failure_reason = metadata.ivorypay_failure_reason;
        }
        else {
            statusResult.paystack_transfer_code = metadata.paystack_transfer_code;
            statusResult.paystack_transfer_status = metadata.paystack_transfer_status;
            statusResult.paystack_failure_reason = metadata.paystack_failure_reason;
            if (metadata.paystack_transfer_code) {
                try {
                    const transferStatus = await this.paystack.getTransferStatus(metadata.paystack_transfer_code);
                    statusResult.paystack_transfer_details = transferStatus;
                    statusResult.paystack_transfer_status = transferStatus.status || statusResult.paystack_transfer_status;
                }
                catch (e) {
                    statusResult.paystack_transfer_status_error = e.message || 'Unable to query paystack transfer status';
                }
            }
        }
        return statusResult;
    }
    async processWithdrawal(reference) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
        if (!withdrawal || withdrawal.status !== 'PENDING')
            return;
        await this.prisma.withdrawal.update({ where: { reference }, data: { status: 'PROCESSING' } });
        try {
            let recipient;
            if (withdrawal.method === 'MOBILE_MONEY') {
                recipient = await this.paystack.createTransferRecipient({
                    type: 'mobile_money',
                    name: withdrawal.accountName || 'FARM User',
                    account_number: this.formatMpesaNumber(withdrawal.phoneNumber),
                    mobile_number: this.formatMpesaNumber(withdrawal.phoneNumber),
                    provider: 'MPESA',
                    bank_code: 'MPESA',
                    currency: 'KES',
                });
            }
            else if (withdrawal.method === 'BANK_TRANSFER') {
                const bankCode = await this.paystack.getBankCodeByName(withdrawal.bankName || '');
                this.logger.log(`Resolved bank name='${withdrawal.bankName}' -> bank_code='${bankCode}'`);
                recipient = await this.paystack.createTransferRecipient({
                    type: 'kepss',
                    name: withdrawal.accountName,
                    account_number: withdrawal.accountNumber,
                    bank_code: bankCode,
                    currency: 'KES',
                    country: 'KE',
                });
            }
            else if (withdrawal.method === 'CRYPTO') {
                await this.processCryptoWithdrawal(withdrawal, reference);
            }
            else {
                throw new common_1.BadRequestException('Unsupported withdrawal method for transfer processing');
            }
            if (recipient) {
                const transferResponse = await this.paystack.initiateTransfer({
                    amount: withdrawal.settlement,
                    recipient: recipient.recipient_code,
                    reference,
                    currency: 'KES',
                });
                const transferData = transferResponse?.data ?? {};
                const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
                if (transaction) {
                    const metadata = transaction.metadata ?? {};
                    const updatedMetadata = {
                        ...metadata,
                        paystack_transfer_code: transferData.transfer_code || transferData.id || metadata.paystack_transfer_code,
                        paystack_transfer_status: transferData.status || metadata.paystack_transfer_status || 'pending',
                        paystack_transfer_initiated_at: new Date().toISOString(),
                    };
                    await this.prisma.transactions.update({
                        where: { id: transaction.id },
                        data: { metadata: updatedMetadata },
                    });
                }
            }
        }
        catch (e) {
            await this.rejectWithdrawal(reference, e.message || 'Withdrawal transfer failed');
        }
    }
    async processCryptoWithdrawal(withdrawal, reference) {
        try {
            const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
            const metadata = transaction?.metadata ?? {};
            const snapshot = metadata.conversion_snapshot ?? null;
            const rate = snapshot ? {
                farm_usd_rate: Number(snapshot.farmUsdRate ?? snapshot.farm_usd_rate ?? 0),
                farm_kes_rate: Number(snapshot.farmKesRate ?? snapshot.farm_kes_rate ?? 1),
                usd_kes_rate: Number(snapshot.usdKesRate ?? snapshot.usd_kes_rate ?? 150),
            } : await this.currencyConversionService.getCurrentRate();
            const farmUsdRate = Number(rate.farm_usd_rate ?? 0);
            const cryptoAddress = withdrawal.cryptoAddress ?? withdrawal.walletAddress ?? withdrawal.walletaddress ?? withdrawal.wallet_address ?? '';
            const cryptoAsset = (withdrawal.cryptoAsset ?? withdrawal.token ?? 'USDT').toString().toUpperCase();
            const normalizedNetwork = (withdrawal.network ?? 'POLYGON').toString().toUpperCase();
            const cryptoAmount = Number((Number(withdrawal.settlement ?? withdrawal.amount ?? 0) * farmUsdRate).toFixed(8));
            const settlementUsd = Number((Number(withdrawal.settlement ?? 0) * farmUsdRate).toFixed(8));
            if (!cryptoAsset || !['USDC', 'USDT'].includes(cryptoAsset)) {
                throw new common_1.BadRequestException('Unsupported crypto asset for IvoryPay withdrawal. Only USDC and USDT are allowed.');
            }
            const supportedNetwork = this.ivorypay['normalizeNetwork']
                ? this.ivorypay['normalizeNetwork'](cryptoAsset, normalizedNetwork)
                : normalizedNetwork;
            if (!supportedNetwork) {
                throw new common_1.BadRequestException(`Unsupported network for ${cryptoAsset}: ${normalizedNetwork}. Please choose a supported network.`);
            }
            if (!cryptoAddress || cryptoAddress.trim().length < 10) {
                throw new common_1.BadRequestException('Destination wallet address is required for crypto withdrawal');
            }
            if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
                throw new common_1.BadRequestException('Invalid crypto conversion amount');
            }
            const opts = {
                reference,
                amount: cryptoAmount,
                crypto: cryptoAsset,
                token: cryptoAsset,
                cryptoAsset: cryptoAsset,
                to_address: cryptoAddress,
                address: cryptoAddress,
                network: supportedNetwork,
                metadata: {
                    user_id: withdrawal.userId,
                    reference,
                    cryptoAsset: cryptoAsset,
                    network: supportedNetwork,
                    conversion_snapshot: {
                        ...(snapshot ?? {}),
                        farmAmount: Number(withdrawal.amount ?? 0),
                        farmKesRate: Number(rate.farm_kes_rate ?? 1),
                        usdKesRate: Number(rate.usd_kes_rate ?? 150),
                        farmUsdRate: farmUsdRate,
                        cryptoCurrency: cryptoAsset,
                        cryptoAmount,
                        network: supportedNetwork,
                        conversionTimestamp: new Date().toISOString(),
                    },
                    settlement_usd: settlementUsd,
                },
            };
            const resp = await this.ivorypay.createWithdrawal(opts);
            const withdrawalId = resp?.data?.id || resp?.providerTransactionId || resp?.providerReference || null;
            if (transaction) {
                const existingMetadata = transaction.metadata ?? {};
                await this.prisma.transactions.update({
                    where: { id: transaction.id },
                    data: {
                        metadata: {
                            ...existingMetadata,
                            provider: 'ivorypay',
                            ivorypay_withdrawal_id: withdrawalId,
                            ivorypay_withdrawal_status: 'pending',
                            settlement_usd: settlementUsd,
                        },
                    },
                });
            }
        }
        catch (e) {
            await this.rejectWithdrawal(reference, e.message || 'Crypto withdrawal failed');
        }
    }
    async markAsSuccess(reference) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
        if (!withdrawal)
            return false;
        if (withdrawal.status === 'COMPLETED')
            return true;
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: withdrawal.userId, is_active: true } });
        if (!wallet)
            return false;
        const amount = Number(withdrawal.amount ?? 0);
        const previousBalance = Number(wallet.balance ?? 0);
        const previousLocked = Number(wallet.locked_balance ?? 0);
        const unlockAmount = Math.min(previousLocked, amount);
        const finalized = await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.withdrawal.updateMany({
                where: { reference, status: { not: 'COMPLETED' } },
                data: { status: 'COMPLETED' },
            });
            if (claimed.count !== 1)
                return false;
            await tx.wallets.update({
                where: { id: wallet.id },
                data: {
                    balance: { decrement: amount },
                    locked_balance: { decrement: unlockAmount },
                },
            });
            if (transaction) {
                await tx.transactions.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'completed',
                        processed_at: new Date(),
                        description: 'Successful withdrawal',
                    },
                });
                await tx.ledger_entries.create({
                    data: {
                        transaction_id: transaction.id,
                        wallet_id: wallet.id,
                        entry_type: 'debit',
                        amount,
                        balance_before: previousBalance,
                        balance_after: previousBalance - amount,
                        description: `Withdrawal completed — ref: ${reference}`,
                    },
                });
            }
            return true;
        });
        if (!finalized)
            return true;
        this.creditPlatformFee(reference).catch((e) => this.logger.error(`creditPlatformFee error: ${e?.message ?? e}`));
        await Promise.all([
            this.cache.cacheInvalidatePattern(`wallet:${withdrawal.userId}:balance`),
            this.cache.cacheInvalidatePattern(`dashboard:${withdrawal.userId}`),
            this.cache.cacheInvalidatePattern(`transactions:${withdrawal.userId}:*`),
            this.cache.cacheDelete('admin:dashboard:stats'),
            this.cache.cacheDelete('admin:analytics'),
            this.cache.cacheDelete('admin:superadmin-dashboard'),
        ]);
        await this.notificationsService.sendNotification(withdrawal.userId, {
            type: 'withdrawal_completed',
            title: 'Withdrawal completed',
            body: `Your withdrawal of ${Number(withdrawal.amount ?? 0)} FARM has been processed successfully.`,
            entityId: withdrawal.id,
            metadata: { reference, amount: Number(withdrawal.amount ?? 0), currency: withdrawal.currency || 'FARM' },
        });
        return true;
    }
    async creditPlatformFee(reference) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
        if (!withdrawal)
            return;
        const platformFee = Number(withdrawal.fee ?? 0);
        if (platformFee <= 0)
            return;
        try {
            const superadminUser = await this.prisma.users.findFirst({
                where: { role: 'super_admin', is_deleted: false },
                include: { wallets: { where: { is_active: true }, take: 1 } },
            });
            if (!superadminUser || !superadminUser.wallets || superadminUser.wallets.length === 0)
                return;
            const superWallet = superadminUser.wallets[0];
            await this.prisma.$transaction(async (tx) => {
                await tx.wallets.update({ where: { id: superWallet.id }, data: { balance: { increment: platformFee } } });
                await tx.ledger_entries.create({
                    data: {
                        transaction_id: null,
                        wallet_id: superWallet.id,
                        entry_type: 'credit',
                        amount: platformFee,
                        balance_before: Number(superWallet.balance ?? 0),
                        balance_after: Number(superWallet.balance ?? 0) + platformFee,
                        description: `Platform withdrawal fee credited — ref: ${reference}`,
                    },
                });
            });
        }
        catch (e) {
            this.logger.error(`Failed to credit platform fee for ${reference}: ${e?.message ?? e}`);
        }
    }
    async rejectWithdrawal(reference, reason) {
        const withdrawal = await this.prisma.withdrawal.findUnique({ where: { reference } });
        if (!withdrawal)
            return false;
        if (withdrawal.status === 'FAILED')
            return true;
        const transaction = await this.prisma.transactions.findUnique({ where: { transaction_reference: reference } });
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: withdrawal.userId, is_active: true } });
        if (!wallet)
            return false;
        const amount = Number(withdrawal.amount ?? 0);
        const previousLocked = Number(wallet.locked_balance ?? 0);
        const unlockAmount = Math.min(previousLocked, amount);
        await this.prisma.$transaction(async (tx) => {
            await tx.withdrawal.update({
                where: { reference },
                data: { status: 'FAILED', rejectionReason: reason },
            });
            await tx.wallets.update({
                where: { id: wallet.id },
                data: { locked_balance: { decrement: unlockAmount } },
            });
            if (transaction) {
                const metadata = transaction.metadata ?? {};
                const failureMetadata = withdrawal.method === 'CRYPTO'
                    ? {
                        ...metadata,
                        provider: 'ivorypay',
                        ivorypay_failure_reason: reason,
                        ivorypay_withdrawal_status: 'failed',
                    }
                    : {
                        ...metadata,
                        provider: 'paystack',
                        paystack_failure_reason: reason,
                        paystack_transfer_status: 'failed',
                    };
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
        await Promise.all([
            this.cache.cacheInvalidatePattern(`wallet:${withdrawal.userId}:balance`),
            this.cache.cacheInvalidatePattern(`dashboard:${withdrawal.userId}`),
            this.cache.cacheInvalidatePattern(`transactions:${withdrawal.userId}:*`),
            this.cache.cacheDelete('admin:dashboard:stats'),
            this.cache.cacheDelete('admin:analytics'),
            this.cache.cacheDelete('admin:superadmin-dashboard'),
        ]);
        await this.notificationsService.sendNotification(withdrawal.userId, {
            type: 'transaction',
            title: 'Withdrawal failed',
            body: reason ? `Your withdrawal could not be completed: ${reason}` : 'Your withdrawal could not be completed.',
            entityId: withdrawal.id,
            metadata: { reference, reason },
        });
        return true;
    }
    formatMpesaNumber(phone) {
        if (!phone)
            return phone || '';
        if (phone.startsWith('+254')) {
            return '0' + phone.substring(4);
        }
        return phone;
    }
    resolveBankCode(bankName) {
        return bankName?.toUpperCase() ?? bankName;
    }
};
exports.WithdrawService = WithdrawService;
exports.WithdrawService = WithdrawService = WithdrawService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        security_service_1.SecurityService,
        paystack_service_1.PaystackService,
        ivorypay_service_1.IvorypayService,
        cache_service_1.CacheService,
        notifications_service_1.NotificationsService,
        currency_conversion_service_1.CurrencyConversionService])
], WithdrawService);
//# sourceMappingURL=withdraw.service.js.map