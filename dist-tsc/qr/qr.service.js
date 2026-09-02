"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var QrService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const QRCode = __importStar(require("qrcode"));
const prisma_service_1 = require("../database/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const security_service_1 = require("../security/security.service");
const notifications_service_1 = require("../notifications/notifications.service");
const reference_util_1 = require("../common/utils/reference.util");
let QrService = QrService_1 = class QrService {
    constructor(prisma, authService, securityService, cfg, notificationsService) {
        this.prisma = prisma;
        this.authService = authService;
        this.securityService = securityService;
        this.cfg = cfg;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(QrService_1.name);
    }
    async generateMerchantQr(merchantId) {
        const merchant = await this.prisma.merchants.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        const payload = { merchant_id: merchantId, business_name: merchant.business_name, v: 1 };
        const payloadStr = JSON.stringify(payload);
        const sig = this.sign(payloadStr, merchant.qr_secret || this.cfg.get('QR_HMAC_SECRET', ''));
        const signed = JSON.stringify({ ...payload, sig });
        const qr_image = await QRCode.toDataURL(signed);
        await this.prisma.merchants.update({ where: { id: merchantId }, data: { qr_code: signed } });
        return {
            data: {
                qr_payload: signed,
                qr_image_base64: qr_image,
                qr_image_data_url: qr_image,
            },
        };
    }
    async getMerchantQr(merchantId) {
        const merchant = await this.prisma.merchants.findUnique({ where: { id: merchantId } });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        if (!merchant.qr_code) {
            return this.generateMerchantQr(merchantId);
        }
        const qr_image = await QRCode.toDataURL(merchant.qr_code);
        return {
            data: {
                qr_payload: merchant.qr_code,
                qr_image_base64: qr_image,
                qr_image_data_url: qr_image,
            },
        };
    }
    async generateReceiveQr(userId, amount) {
        const wallet = await this.prisma.wallets.findFirst({
            where: { user_id: userId, is_active: true },
        });
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
        const payload = JSON.stringify({
            wallet_address: wallet.wallet_address, amount: amount || null, v: 1,
        });
        const qr_image = await QRCode.toDataURL(payload);
        return { data: { qr_payload: payload, qr_image_base64: qr_image } };
    }
    async validate(scannedPayload, customerId) {
        let parsed;
        try {
            parsed = JSON.parse(scannedPayload);
        }
        catch {
            const identifier = scannedPayload.trim();
            if (!identifier)
                throw new common_1.BadRequestException('Invalid QR payload');
            const normalizedUsername = identifier.startsWith('@')
                ? identifier.substring(1).trim().toLowerCase()
                : identifier.toLowerCase();
            const user = await this.prisma.users.findFirst({
                where: {
                    OR: [
                        { username: normalizedUsername },
                        { phone: identifier },
                    ],
                },
                include: {
                    wallets: {
                        where: { is_active: true },
                        take: 1,
                    },
                },
            });
            if (!user || !user.wallets?.length) {
                throw new common_1.BadRequestException('User not found or wallet unavailable');
            }
            return {
                data: {
                    valid: true,
                    type: 'peer',
                    wallet_address: user.wallets[0].wallet_address,
                    suggested_amount: null,
                },
            };
        }
        if (parsed.merchant_id) {
            const merchant = await this.prisma.merchants.findUnique({ where: { id: parsed.merchant_id } });
            if (!merchant) {
                throw new common_1.BadRequestException('Merchant not found');
            }
            const { sig, ...data } = parsed;
            const expected = this.sign(JSON.stringify(data), merchant.qr_secret || this.cfg.get('QR_HMAC_SECRET', ''));
            if (sig !== expected)
                throw new common_1.BadRequestException('QR signature invalid');
            return {
                data: {
                    valid: true,
                    type: 'merchant',
                    merchant_id: merchant.id,
                    business_name: merchant.business_name || parsed.business_name || 'Merchant',
                    fee_percent: Number(merchant.transaction_fee_percent || 0),
                    daily_limit: Number(merchant.daily_limit || 0),
                },
            };
        }
        if (parsed.wallet_address) {
            const wallet = await this.prisma.wallets.findUnique({
                where: { wallet_address: parsed.wallet_address },
            });
            if (!wallet)
                throw new common_1.BadRequestException('Invalid wallet address');
            return { data: { valid: true, type: 'peer', wallet_address: parsed.wallet_address, suggested_amount: parsed.amount } };
        }
        throw new common_1.BadRequestException('Unknown QR type');
    }
    async merchantPay(customerId, dto) {
        if (dto.amount <= 0)
            throw new common_1.BadRequestException('Amount must be positive');
        if (dto.biometric_auth) {
            const deviceFingerprint = dto.device_fingerprint || dto.deviceFingerprint;
            if (!deviceFingerprint)
                throw new common_1.BadRequestException('Device fingerprint required for biometric authorization');
            const verified = await this.securityService.verifyDevice(customerId, deviceFingerprint);
            if (!verified || verified.trusted !== true) {
                throw new common_1.BadRequestException('Biometric device verification failed');
            }
        }
        else {
            if (!dto.pin)
                throw new common_1.BadRequestException('Transaction PIN required');
            await this.authService.verifyPin(customerId, dto.pin);
        }
        const validation = (await this.validate(dto.qr_payload, customerId)).data;
        if (!validation.valid || validation.type !== 'merchant')
            throw new common_1.BadRequestException('Invalid merchant QR');
        const merchant = await this.prisma.merchants.findUnique({
            where: { id: validation.merchant_id },
        });
        if (!merchant)
            throw new common_1.NotFoundException('Merchant not found');
        const customerWallet = await this.prisma.wallets.findFirst({
            where: { user_id: customerId, is_active: true },
        });
        const merchantWallet = await this.prisma.wallets.findFirst({
            where: { user_id: merchant.user_id },
        });
        if (!customerWallet || !merchantWallet)
            throw new common_1.NotFoundException('Wallet not found');
        const fee = dto.amount * (Number(merchant.transaction_fee_percent) / 100);
        const totalOut = dto.amount + fee;
        const available = Number(customerWallet.balance) - Number(customerWallet.locked_balance);
        if (available < totalOut)
            throw new common_1.BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);
        const result = await this.prisma.$transaction(async (tx) => {
            const reference = (0, reference_util_1.generateTxReference)();
            const txn = await tx.transactions.create({
                data: {
                    transaction_reference: reference,
                    sender_wallet_id: customerWallet.id,
                    receiver_wallet_id: merchantWallet.id,
                    transaction_type: 'merchant_payment',
                    status: 'completed',
                    amount: dto.amount, fee, net_amount: dto.amount - fee,
                    currency: 'FARM',
                    description: `Payment to ${merchant.business_name}`,
                    metadata: { user_id: customerId, merchant_id: merchant.id },
                    processed_at: new Date(),
                },
            });
            await tx.wallets.update({
                where: { id: customerWallet.id }, data: { balance: { decrement: totalOut } },
            });
            await tx.wallets.update({
                where: { id: merchantWallet.id }, data: { balance: { increment: dto.amount } },
            });
            const platformWallet = await tx.wallets.findFirst({
                where: {
                    OR: [
                        { wallet_type: 'platform', is_active: true },
                        { user_id: null, is_active: true },
                    ],
                },
            });
            if (platformWallet) {
                await tx.wallets.update({
                    where: { id: platformWallet.id },
                    data: { balance: { increment: fee } },
                });
            }
            await tx.merchants.update({
                where: { id: merchant.id }, data: { total_sales: { increment: dto.amount } },
            });
            await tx.qr_payments.create({
                data: {
                    merchant_id: merchant.id, customer_id: customerId,
                    transaction_id: txn.id, qr_payload: dto.qr_payload,
                    amount: dto.amount, status: 'completed', scanned_at: new Date(),
                },
            });
            await tx.ledger_entries.createMany({
                data: [
                    {
                        transaction_id: txn.id, wallet_id: customerWallet.id,
                        entry_type: 'debit', amount: totalOut,
                        description: `QR payment to ${merchant.business_name}`,
                    },
                    {
                        transaction_id: txn.id, wallet_id: merchantWallet.id,
                        entry_type: 'credit', amount: dto.amount,
                        description: 'QR payment received',
                    },
                    ...(platformWallet ? [{
                            transaction_id: txn.id, wallet_id: platformWallet.id,
                            entry_type: 'credit', amount: fee,
                            description: 'Platform fee from merchant QR payment',
                        }] : []),
                ],
            });
            return txn;
        });
        const customer = await this.prisma.users.findUnique({
            where: { id: customerId },
            select: { username: true },
        });
        const payerName = customer?.username != null ? `@${customer.username}` : 'A customer';
        await Promise.all([
            this.notificationsService.sendNotification(customerId, {
                type: 'merchant',
                entityId: result.transaction_reference,
                title: 'Merchant payment sent',
                body: `You sent ${dto.amount} FARM to ${merchant.business_name}.`,
                metadata: {
                    merchant_id: merchant.id,
                    merchant_name: merchant.business_name,
                    amount: dto.amount,
                    event: 'merchant_payment_sent',
                },
            }),
            merchant.user_id
                ? this.notificationsService.sendNotification(merchant.user_id, {
                    type: 'merchant',
                    entityId: result.transaction_reference,
                    title: 'Merchant payment received',
                    body: `You received ${dto.amount} FARM from ${payerName}.`,
                    metadata: {
                        merchant_id: merchant.id,
                        customer_id: customerId,
                        customer_username: customer?.username,
                        amount: dto.amount,
                        event: 'merchant_payment_received',
                    },
                })
                : Promise.resolve(null),
        ]).catch((error) => this.logger.error('Merchant payment notification failed', error));
        return {
            data: { reference: result.transaction_reference, amount: dto.amount, fee, status: 'completed' },
            message: `Payment to ${merchant.business_name} successful`,
        };
    }
    sign(data, secret) {
        return (0, crypto_1.createHmac)('sha256', secret || 'fallback').update(data).digest('hex');
    }
};
exports.QrService = QrService;
exports.QrService = QrService = QrService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        security_service_1.SecurityService,
        config_1.ConfigService,
        notifications_service_1.NotificationsService])
], QrService);
//# sourceMappingURL=qr.service.js.map