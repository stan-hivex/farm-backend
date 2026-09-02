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
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../database/prisma.service");
const paystack_service_1 = require("../paystack/paystack.service");
const ivorypay_service_1 = require("../ivorypay/ivorypay.service");
const reference_util_1 = require("../common/utils/reference.util");
const cache_service_1 = require("../common/cache/cache.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const currency_conversion_service_1 = require("../currency/currency-conversion.service");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    constructor(prisma, cfg, ivorypay, paystack, cache, currencyConversionService) {
        this.prisma = prisma;
        this.cfg = cfg;
        this.ivorypay = ivorypay;
        this.paystack = paystack;
        this.cache = cache;
        this.currencyConversionService = currencyConversionService;
        this.logger = new common_1.Logger(PaymentsService_1.name);
    }
    async initiateDeposit(userId, dto, ctx) {
        const supportedPaymentMethods = ['CARD', 'MOBILE_MONEY', 'CRYPTO', 'BANK_TRANSFER'];
        const rawPaymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
        if (!supportedPaymentMethods.includes(rawPaymentMethod)) {
            throw new common_1.BadRequestException(`Unsupported payment method ${dto.paymentMethod}`);
        }
        const paymentMethod = rawPaymentMethod;
        const user = await this.prisma.users.findUnique({
            where: { id: userId }, select: { email: true, phone: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const reference = (0, reference_util_1.generateTxReference)();
        const rate = await this.getExchangeRate(dto.currency, 'FARM');
        const amount_farm = dto.amount_fiat / rate;
        const fee_fiat = dto.amount_fiat * 0.02;
        const total_fiat = dto.amount_fiat + fee_fiat;
        const fraud = await this.assessFraudRisk(userId, {
            amount_fiat: dto.amount_fiat,
            currency: dto.currency,
            ip: ctx?.ip || '',
            deviceRisk: ctx?.deviceRisk,
            country: ctx?.country,
        });
        if (fraud.block) {
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_blocked',
                    entity_type: 'transaction',
                    entity_id: null,
                    new_values: { reason: fraud.reason, details: fraud },
                },
            });
            await this.prisma.security_events.create({
                data: {
                    user_id: userId,
                    event_type: 'fraud_score_high',
                    description: `Blocked deposit attempt: ${fraud.reason} | ${JSON.stringify(fraud)}`,
                    severity: 'high',
                },
            });
            this.logger.warn(`Deposit blocked for user=${userId} reference=${reference} reason=${fraud.reason} details=${JSON.stringify(fraud)}`);
            const reasonLabel = typeof fraud.reason === 'string' ? fraud.reason : 'unknown_reason';
            throw new common_1.BadRequestException(`Deposit blocked by fraud protection: ${reasonLabel}`);
        }
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
        if (paymentMethod === 'MOBILE_MONEY') {
            const phone = dto.phone || user.phone;
            if (!phone) {
                throw new common_1.BadRequestException('Phone number is required for mobile money deposits');
            }
            if (!phone.startsWith('+')) {
                this.logger.warn(`Mobile-money phone not in international format: ${phone}. Expected format: +254XXXXXXXXX`);
            }
            const response = await this.paystack.initializePayment({
                email: user.email || `${user.phone}@farm.app`,
                amount: dto.amount_fiat,
                currency: dto.currency,
                reference,
                channels: ['mobile_money'],
                phone,
                metadata: {
                    user_id: userId,
                    currency: dto.currency,
                },
            });
            const tx = await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: amount_farm,
                    fee: 0,
                    net_amount: amount_farm,
                    currency: 'FARM',
                    description: `Pending mobile money deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
                    metadata: {
                        provider: 'paystack',
                        amount_fiat: dto.amount_fiat,
                        currency_fiat: dto.currency,
                        exchange_rate: rate,
                        user_id: userId,
                        device_risk: ctx?.deviceRisk ?? null,
                        ip: ctx?.ip ?? null,
                        payment_method: 'MOBILE_MONEY',
                    },
                },
            });
            this.logger.log(`initiateDeposit: created Paystack mobile-money transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_initiated',
                    entity_type: 'transaction',
                    entity_id: tx.id,
                    new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
                },
            });
            await this.prisma.deposit.create({
                data: {
                    userId,
                    amount: amount_farm,
                    fee: 0,
                    total: amount_farm,
                    currency: 'FARM',
                    paymentMethod: 'MOBILE_MONEY',
                    provider: 'paystack',
                    reference,
                    status: 'PENDING',
                },
            });
            return {
                data: {
                    provider: 'PAYSTACK',
                    reference,
                    payment_url: response.authorization_url || response.authorizationUrl,
                    authorization_url: response.authorization_url || response.authorizationUrl,
                },
                message: 'Mobile money deposit initiated via Paystack checkout',
            };
        }
        if (paymentMethod === 'CRYPTO') {
            const farmAmount = amount_farm;
            const currentRate = await this.currencyConversionService.getCurrentRate();
            const farmToUsdRate = Number(currentRate.farm_usd_rate);
            if (!Number.isFinite(farmToUsdRate) || farmToUsdRate <= 0) {
                throw new common_1.BadRequestException('The FARM/USD conversion rate is unavailable');
            }
            const amountUsd = Number((farmAmount * farmToUsdRate).toFixed(2));
            const usdToFarmRate = Number((1 / farmToUsdRate).toFixed(8));
            const payment = await this.ivorypay.createPayment({
                amount: amountUsd,
                currency: 'USD',
                reference,
                email: user.email || `${user.phone}@farm.app`,
                description: `Farm deposit - ${farmAmount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
                baseFiat: 'USD',
                metadata: {
                    provider: 'ivorypay',
                    amount_farm: farmAmount,
                    amount_usd: amountUsd,
                    farm_to_usd_rate: farmToUsdRate,
                    usd_to_farm_rate: usdToFarmRate,
                    currency_fiat: 'USD',
                    exchange_rate: rate,
                    user_id: userId,
                    device_risk: ctx?.deviceRisk ?? null,
                    ip: ctx?.ip ?? null,
                    payment_method: 'CRYPTO',
                },
            });
            const providerRef = payment.providerReference ??
                payment.data?.id ??
                payment.data?.reference ??
                reference;
            const tx = await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: amount_farm,
                    fee: 0,
                    net_amount: amount_farm,
                    currency: 'FARM',
                    description: `Pending crypto deposit via Ivorypay (${farmAmount} FARM → ${amountUsd} USD)`,
                    metadata: {
                        provider: 'ivorypay',
                        provider_ref: providerRef,
                        amount_farm: farmAmount,
                        amount_usd: amountUsd,
                        farm_to_usd_rate: farmToUsdRate,
                        usd_to_farm_rate: usdToFarmRate,
                        currency_fiat: 'USD',
                        exchange_rate: rate,
                        user_id: userId,
                        device_risk: ctx?.deviceRisk ?? null,
                        ip: ctx?.ip ?? null,
                        payment_method: 'CRYPTO',
                    },
                },
            });
            this.logger.log(`initiateDeposit: created Ivorypay crypto transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_initiated',
                    entity_type: 'transaction',
                    entity_id: tx.id,
                    new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
                },
            });
            await this.prisma.deposit.create({
                data: {
                    userId,
                    amount: amount_farm,
                    fee: 0,
                    total: amount_farm,
                    currency: 'FARM',
                    paymentMethod: 'CRYPTO',
                    provider: 'ivorypay',
                    reference,
                    providerRef,
                    status: 'PENDING',
                },
            });
            return {
                data: {
                    provider: 'IVORYPAY',
                    reference,
                    payment_link: payment.data?.payment_link || payment.payment_link,
                    checkout_url: payment.data?.checkout_url || payment.checkout_url,
                },
                message: 'Crypto deposit initiated via Ivorypay',
            };
        }
        if (paymentMethod === 'CARD') {
            const response = await this.paystack.initializePayment({
                email: user.email || `${user.phone}@farm.app`,
                amount: dto.amount_fiat,
                currency: dto.currency,
                reference,
                channels: ['card'],
                metadata: {
                    provider: 'paystack',
                    amount_fiat: dto.amount_fiat,
                    currency_fiat: dto.currency,
                    exchange_rate: rate,
                    user_id: userId,
                    device_risk: ctx?.deviceRisk ?? null,
                    ip: ctx?.ip ?? null,
                    payment_method: paymentMethod,
                },
            });
            const tx = await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: amount_farm,
                    fee: 0,
                    net_amount: amount_farm,
                    currency: 'FARM',
                    description: `Pending Card deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
                    metadata: {
                        provider: 'paystack',
                        amount_fiat: dto.amount_fiat,
                        currency_fiat: dto.currency,
                        exchange_rate: rate,
                        user_id: userId,
                        device_risk: ctx?.deviceRisk ?? null,
                        ip: ctx?.ip ?? null,
                        payment_method: paymentMethod,
                    },
                },
            });
            this.logger.log(`initiateDeposit: created Paystack card transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_initiated',
                    entity_type: 'transaction',
                    entity_id: tx.id,
                    new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
                },
            });
            await this.prisma.deposit.create({
                data: {
                    userId,
                    amount: amount_farm,
                    fee: 0,
                    total: amount_farm,
                    currency: 'FARM',
                    paymentMethod,
                    provider: 'paystack',
                    reference,
                    status: 'PENDING',
                },
            });
            return {
                data: {
                    provider: 'PAYSTACK',
                    reference,
                    payment_url: response.authorization_url || response.authorizationUrl,
                    authorization_url: response.authorization_url || response.authorizationUrl,
                },
                message: 'Card deposit initiated via Paystack checkout',
            };
        }
        if (paymentMethod === 'BANK_TRANSFER') {
            const response = await this.paystack.initializePayment({
                email: user.email || `${user.phone}@farm.app`,
                amount: dto.amount_fiat,
                currency: dto.currency,
                reference,
                channels: ['bank_transfer'],
                metadata: {
                    provider: 'paystack',
                    amount_fiat: dto.amount_fiat,
                    currency_fiat: dto.currency,
                    exchange_rate: rate,
                    user_id: userId,
                    device_risk: ctx?.deviceRisk ?? null,
                    ip: ctx?.ip ?? null,
                    payment_method: paymentMethod,
                },
            });
            const tx = await this.prisma.transactions.create({
                data: {
                    transaction_reference: reference,
                    receiver_wallet_id: wallet?.id,
                    transaction_type: 'deposit',
                    status: 'pending',
                    amount: amount_farm,
                    fee: 0,
                    net_amount: amount_farm,
                    currency: 'FARM',
                    description: `Pending bank transfer deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
                    metadata: {
                        provider: 'paystack',
                        amount_fiat: dto.amount_fiat,
                        currency_fiat: dto.currency,
                        exchange_rate: rate,
                        user_id: userId,
                        device_risk: ctx?.deviceRisk ?? null,
                        ip: ctx?.ip ?? null,
                        payment_method: paymentMethod,
                    },
                },
            });
            this.logger.log(`initiateDeposit: created Paystack bank transfer transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'deposit_initiated',
                    entity_type: 'transaction',
                    entity_id: tx.id,
                    new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
                },
            });
            await this.prisma.deposit.create({
                data: {
                    userId,
                    amount: amount_farm,
                    fee: 0,
                    total: amount_farm,
                    currency: 'FARM',
                    paymentMethod,
                    provider: 'paystack',
                    reference,
                    status: 'PENDING',
                },
            });
            return {
                data: {
                    provider: 'PAYSTACK',
                    reference,
                    payment_url: response.authorization_url || response.authorizationUrl,
                    authorization_url: response.authorization_url || response.authorizationUrl,
                },
                message: 'Bank transfer deposit initiated via Paystack checkout',
            };
        }
        throw new common_1.BadRequestException(`Unsupported payment method ${paymentMethod}`);
    }
    async getExchangeRate(from, to) {
        const fromCode = from.toUpperCase();
        const toCode = to.toUpperCase();
        if (fromCode === toCode)
            return 1;
        const cacheKey = `exchange-rate:${fromCode}:${toCode}`;
        const cached = await this.cache.cacheGet(cacheKey);
        if (cached !== null && cached !== undefined)
            return cached;
        const directRate = await this.prisma.exchange_rates.findFirst({
            where: { base_currency: fromCode, target_currency: toCode },
            orderBy: { fetched_at: 'desc' },
        });
        if (directRate) {
            const rate = Number(directRate.rate);
            await this.cache.cacheSet(cacheKey, rate, 300);
            return rate;
        }
        const reverseRate = await this.prisma.exchange_rates.findFirst({
            where: { base_currency: toCode, target_currency: fromCode },
            orderBy: { fetched_at: 'desc' },
        });
        if (reverseRate && Number(reverseRate.rate) !== 0) {
            const rate = 1 / Number(reverseRate.rate);
            await this.cache.cacheSet(cacheKey, rate, 300);
            return rate;
        }
        await this.cache.cacheSet(cacheKey, 1, 300);
        return 1;
    }
    async assessFraudRisk(userId, ctx) {
        const keys = ['fraud.amount_threshold', 'fraud.velocity_limit', 'fraud.max_daily_amount'];
        const settings = await this.prisma.system_settings.findMany({ where: { setting_key: { in: keys } } });
        const getSetting = (k) => {
            const s = settings.find((x) => x.setting_key === k);
            if (!s || s.setting_value == null)
                return null;
            try {
                return JSON.parse(s.setting_value);
            }
            catch { }
            const n = Number(s.setting_value);
            return Number.isFinite(n) ? n : s.setting_value;
        };
        const amountThreshold = Number(getSetting('fraud.amount_threshold') ?? 5000);
        const velocityLimit = Number(getSetting('fraud.velocity_limit') ?? 5);
        const maxDailyAmount = Number(getSetting('fraud.max_daily_amount') ?? 20000);
        const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60);
        const recent = await this.prisma.transactions.count({
            where: {
                transaction_type: 'deposit',
                created_at: { gte: oneHourAgo },
                AND: [{ metadata: { path: ['user_id'], equals: userId } }],
            },
        });
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todays = await this.prisma.transactions.aggregate({
            _sum: { amount: true },
            where: {
                transaction_type: 'deposit',
                created_at: { gte: startOfDay },
                AND: [{ metadata: { path: ['user_id'], equals: userId } }],
            },
        });
        const todaysSum = Number(todays._sum?.amount ?? 0);
        if (ctx.amount_fiat > amountThreshold) {
            return { block: true, reason: 'amount_exceeds_threshold', threshold: amountThreshold };
        }
        if (recent >= velocityLimit) {
            return { block: false, challenge: true, reason: 'high_velocity', limit: velocityLimit };
        }
        if (todaysSum + ctx.amount_fiat > maxDailyAmount) {
            return { block: true, reason: 'daily_limit_exceeded', maxDailyAmount };
        }
        try {
            const rulesPath = path.join(process.cwd(), 'fraud.rules.json');
            if (fs.existsSync(rulesPath)) {
                const raw = fs.readFileSync(rulesPath, 'utf8');
                const rules = JSON.parse(raw);
                rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
                for (const r of rules) {
                    if (r.min_amount && ctx.amount_fiat < r.min_amount)
                        continue;
                    if (r.max_amount && ctx.amount_fiat > r.max_amount)
                        continue;
                    if (r.countries && Array.isArray(r.countries)) {
                        const country = ctx.country;
                        if (!country)
                            continue;
                        if (r.countries.indexOf(country) === -1)
                            continue;
                    }
                    if (r.ip_prefixes && Array.isArray(r.ip_prefixes) && ctx.ip) {
                        let matched = false;
                        for (const pfx of r.ip_prefixes) {
                            if (ctx.ip.startsWith(pfx)) {
                                matched = true;
                                break;
                            }
                        }
                        if (!matched)
                            continue;
                    }
                    if (r.device_risk_threshold) {
                        const dv = Number(ctx.deviceRisk || 0);
                        if (dv < Number(r.device_risk_threshold))
                            continue;
                    }
                    if (r.action === 'block')
                        return { block: true, reason: r.reason || r.id, rule: r.id };
                    if (r.action === 'challenge')
                        return { block: false, challenge: true, reason: r.reason || r.id, rule: r.id };
                }
            }
        }
        catch (err) {
            this.logger.warn(`Failed to evaluate fraud.rules: ${err?.message ?? String(err)}`);
        }
        return { block: false };
    }
    async getDepositHistory(userId) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        const items = await this.prisma.transactions.findMany({
            where: { transaction_type: 'deposit', receiver_wallet_id: wallet?.id },
            orderBy: { created_at: 'desc' },
        });
        return { data: items.map((t) => ({ ...t, amount: Number(t.amount) })) };
    }
    async getWithdrawalHistory(userId) {
        const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
        const items = await this.prisma.transactions.findMany({
            where: {
                transaction_type: 'withdrawal',
                sender_wallet_id: wallet?.id,
                status: { not: 'failed' },
            },
            orderBy: { created_at: 'desc' },
        });
        return {
            data: items.map((t) => {
                const meta = t.metadata ?? {};
                const status = (t.status ?? 'UNKNOWN').toUpperCase();
                return {
                    ...t,
                    amount: Number(t.amount),
                    method: meta.method ?? 'BANK',
                    status: t.status?.toLowerCase() === 'completed' ? 'SUCCESS' : status,
                };
            }),
        };
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        ivorypay_service_1.IvorypayService,
        paystack_service_1.PaystackService,
        cache_service_1.CacheService,
        currency_conversion_service_1.CurrencyConversionService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map