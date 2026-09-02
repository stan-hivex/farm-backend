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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PaystackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaystackService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let PaystackService = PaystackService_1 = class PaystackService {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(PaystackService_1.name);
        this.paystackBaseUrl = 'https://api.paystack.co';
        this.kenyaBankCodeFallback = {
            'i&m': 'IM',
            'im': 'IM',
            'imbank': 'IM',
            'iandm': 'IM',
            'iandmbank': 'IM',
            'co-operativebank': 'COOP',
            'cooperativebank': 'COOP',
            'cooperative bank': 'COOP',
            'equity': 'EQB',
            'kcb': 'KCB',
            'kenya commercial bank': 'KCB',
            'stanbic': 'SBK',
            'barclays': 'BAR',
            'barclays bank': 'BAR',
            'standardchartered': 'SCB',
            'standard chartered': 'SCB',
            'scbk': 'SCB',
            'absa': 'ABSA',
            'fnb': 'FNB',
            'dfcu': 'DFCU',
            'ncb': 'NCB',
            'ncba': 'NCB',
            'familybank': 'FBP',
            'family bank': 'FBP',
            'spencer': 'SCBK',
            'postbank': 'POSTA',
            'stanchart': 'SCB',
            'icbd': 'ICBD',
            'diamond trust bank': 'DTB',
            'dtb': 'DTB',
            'swift': 'SWIFT'
        };
        this.banksCache = {};
        this.secretKey = this.cfg.get('PAYSTACK_SECRET_KEY');
        const rawBankMap = this.cfg.get('PAYSTACK_BANK_CODE_MAP');
        if (rawBankMap) {
            try {
                this.bankCodeMap = JSON.parse(rawBankMap);
            }
            catch (e) {
                this.logger.warn('PAYSTACK_BANK_CODE_MAP is not valid JSON. Ignoring configured bank mapping.');
                this.bankCodeMap = {};
            }
        }
        else {
            this.bankCodeMap = {};
        }
    }
    async initializePayment(options) {
        if (!this.secretKey) {
            this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock response');
            return {
                authorization_url: `https://checkout.paystack.com/mock/${options.reference}`,
                authorizationUrl: `https://checkout.paystack.com/mock/${options.reference}`,
            };
        }
        try {
            this.logger.log(`Paystack: initializing transaction for ${options.reference} | ` +
                `channels=${JSON.stringify(options.channels)} | ` +
                `phone=${options.phone || 'N/A'} | ` +
                `currency=${options.currency || 'N/A'} | ` +
                `amount=${options.amount}`);
            const requestBody = {
                email: options.email,
                amount: this.toPaystackAmount(options.amount),
                reference: options.reference,
                ...(options.channels && { channels: options.channels }),
                ...(options.phone && { phone: options.phone }),
                ...(options.metadata && { metadata: options.metadata }),
            };
            if (options.currency) {
                requestBody.currency = options.currency;
            }
            const response = await axios_1.default.post(`${this.paystackBaseUrl}/transaction/initialize`, requestBody, {
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.data.status || !response.data.data) {
                this.logger.error('Paystack initialized with invalid response body', response.data);
                throw new common_1.BadRequestException('Invalid Paystack response');
            }
            this.logger.log(`Paystack: initialized ${options.reference}, auth_url=${response.data.data.authorization_url}`);
            return {
                authorization_url: response.data.data.authorization_url,
                authorizationUrl: response.data.data.authorization_url,
                access_code: response.data.data.access_code,
            };
        }
        catch (e) {
            const apiData = e.response?.data;
            const message = apiData?.message || e.message;
            this.logger.error(`Paystack initialize error: ${message}`);
            if (apiData) {
                this.logger.debug(`Paystack initialize error details: ${JSON.stringify(apiData)}`);
            }
            if (apiData?.code === 'invalid_params' && typeof message === 'string' && message.toLowerCase().includes('no active channel')) {
                const nextStep = apiData?.meta?.nextStep || 'Please enable the required channel in your Paystack dashboard or contact Paystack support.';
                const channelHint = options.channels?.includes('bank')
                    ? 'Bank transfers are not enabled for this Paystack account. Enable bank transfer support in Paystack or use CARD instead.'
                    : 'Please verify your Paystack channel configuration for the requested payment method.';
                throw new common_1.BadRequestException(`Paystack channel unavailable: ${message}. ${channelHint} ${nextStep}`);
            }
            throw new common_1.BadRequestException(`Paystack integration failed: ${message}`);
        }
    }
    async verifyTransaction(reference) {
        if (!this.secretKey) {
            this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock verify');
            return { status: 'success', reference };
        }
        try {
            this.logger.log(`Paystack: verifying transaction ${reference}`);
            const response = await axios_1.default.get(`${this.paystackBaseUrl}/transaction/verify/${reference}`, {
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            if (!response.data.status) {
                throw new common_1.BadRequestException('Transaction verification failed');
            }
            this.logger.log(`Paystack: verified ${reference}, status=${response.data.data?.status}`);
            return response.data.data;
        }
        catch (e) {
            this.logger.error(`Paystack verify error: ${e.response?.data?.message || e.message}`);
            throw new common_1.BadRequestException(`Paystack verification failed: ${e.response?.data?.message || e.message}`);
        }
    }
    async createTransferRecipient(payload) {
        if (!this.secretKey) {
            this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock recipient');
            return { recipient_code: 'RCP_MOCK_123456' };
        }
        try {
            this.logger.debug(`Paystack transfer recipient payload: ${JSON.stringify(payload)}`);
            const response = await axios_1.default.post(`${this.paystackBaseUrl}/transferrecipient`, payload, {
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            this.logger.debug(`Paystack transfer recipient response: ${JSON.stringify(response.data)}`);
            if (!response.data.status) {
                throw new common_1.BadRequestException('Failed to create transfer recipient');
            }
            return response.data.data;
        }
        catch (e) {
            const responseData = e.response?.data;
            const apiMessage = responseData?.message || e.message;
            this.logger.error(`Paystack recipient creation error: ${apiMessage}`);
            if (responseData) {
                this.logger.debug(`Paystack recipient creation error payload: ${JSON.stringify(responseData)}`);
            }
            if (responseData?.code === 'invalid_bank_code' || (typeof apiMessage === 'string' && apiMessage.toLowerCase().includes('bank is invalid'))) {
                const suggested = (() => {
                    try {
                        const normalized = this.normalizeBankName(payload?.bank_name || payload?.name || '');
                        const cfgMap = this.bankCodeMap['KE'] || {};
                        if (cfgMap[normalized])
                            return cfgMap[normalized];
                        if (this.kenyaBankCodeFallback[normalized])
                            return this.kenyaBankCodeFallback[normalized];
                        return null;
                    }
                    catch {
                        return null;
                    }
                })();
                const hintParts = [
                    `Paystack rejected the bank code for '${payload?.bank_name || payload?.name || ''}'.`,
                    "This usually means your Paystack account doesn't have Kenyan bank payouts enabled or the bank code is incorrect.",
                    "Enable Kenyan bank transfers in your Paystack dashboard or use the List Banks endpoint to fetch official bank codes.",
                ];
                if (suggested) {
                    hintParts.push(`Suggested bank_code based on local mapping: '${suggested}'. Verify this in Paystack before retrying.`);
                }
                else {
                    hintParts.push("To fix quickly, add a mapping to PAYSTACK_BANK_CODE_MAP in your .env.production for the bank name -> bank_code.");
                }
                throw new common_1.BadRequestException(`Paystack recipient failed: ${apiMessage}. ${hintParts.join(' ')}`);
            }
            throw new common_1.BadRequestException(`Paystack recipient failed: ${apiMessage}`);
        }
    }
    async getBankCodeByName(bankName, country = 'KE') {
        if (!this.secretKey) {
            return bankName;
        }
        const key = country.toUpperCase();
        if (!this.banksCache[key]) {
            try {
                const resp = await axios_1.default.get(`${this.paystackBaseUrl}/bank?country=${country}`, {
                    headers: { Authorization: `Bearer ${this.secretKey}` },
                });
                this.banksCache[key] = resp.data.data || [];
                this.logger.debug(`Paystack bank list for ${country}: ${JSON.stringify(this.banksCache[key].slice(0, 5))}`);
            }
            catch (e) {
                this.logger.error(`Failed to fetch Paystack banks for ${country}: ${e?.message || e}`);
                if (e.response?.data) {
                    this.logger.debug(`Paystack banks error data: ${JSON.stringify(e.response.data)}`);
                }
                this.banksCache[key] = [];
            }
        }
        const banks = this.banksCache[key] || [];
        const configuredMap = this.bankCodeMap[key] || {};
        const normalized = this.normalizeBankName(bankName);
        if (!banks.length) {
            if (configuredMap[normalized]) {
                this.logger.log(`Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`);
                return configuredMap[normalized];
            }
            if (country.toUpperCase() === 'KE' && this.kenyaBankCodeFallback[normalized]) {
                this.logger.log(`Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`);
                return this.kenyaBankCodeFallback[normalized];
            }
            const message = country.toUpperCase() === 'KE'
                ? `Paystack bank code not available for '${bankName}' in Kenya. Configure PAYSTACK_BANK_CODE_MAP for Kenyan bank name → bank_code mappings or use MOBILE_MONEY/CRYPTO instead.`
                : `No Paystack bank list available for ${country}. Please verify the Paystack configuration and supported countries.`;
            this.logger.error(message);
            throw new common_1.BadRequestException(message);
        }
        for (const b of banks) {
            if ((b.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) {
                return b.code;
            }
        }
        for (const b of banks) {
            if ((b.name || '').toLowerCase().includes(bankName.toLowerCase())) {
                return b.code;
            }
        }
        if (configuredMap[normalized]) {
            this.logger.log(`Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`);
            return configuredMap[normalized];
        }
        if (country.toUpperCase() === 'KE' && this.kenyaBankCodeFallback[normalized]) {
            this.logger.log(`Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`);
            return this.kenyaBankCodeFallback[normalized];
        }
        const sample = banks.slice(0, 8).map((b) => `${b.name} (${b.code})`).join(', ');
        throw new common_1.BadRequestException(`Unknown bank name '${bankName}'. Paystack supported examples: ${sample}`);
    }
    normalizeBankName(bankName) {
        return (bankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    toPaystackAmount(amount) {
        const value = Number(amount);
        if (Number.isNaN(value)) {
            throw new common_1.BadRequestException('Invalid amount for Paystack initialization');
        }
        return Math.round(value * 100);
    }
    formatPhoneForPaystack(phone) {
        if (!phone)
            return '';
        const digits = phone.replace(/[^\d]/g, '');
        if (digits.startsWith('254'))
            return '+' + digits;
        if (digits.startsWith('0'))
            return '+254' + digits.substring(1);
        if (digits.length >= 9 && !digits.startsWith('+'))
            return '+' + digits;
        return phone;
    }
    async initiateTransfer(payload) {
        if (!this.secretKey) {
            this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock transfer');
            return { status: 'success', data: { id: 'TRF_MOCK_123456' } };
        }
        try {
            const transferPayload = {
                ...payload,
                amount: this.toPaystackAmount(payload.amount),
            };
            if (payload.phone_number) {
                transferPayload.recipient_phone = this.formatPhoneForPaystack(payload.phone_number);
            }
            this.logger.debug(`Paystack transfer payload: ${JSON.stringify({
                recipient: transferPayload.recipient,
                amount: transferPayload.amount,
                currency: transferPayload.currency,
                reference: transferPayload.reference,
                recipient_phone: transferPayload.recipient_phone,
            })}`);
            const response = await axios_1.default.post(`${this.paystackBaseUrl}/transfer`, transferPayload, {
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            this.logger.debug(`Paystack transfer response: ${JSON.stringify(response.data)}`);
            if (!response.data.status) {
                throw new common_1.BadRequestException('Failed to initiate transfer');
            }
            return response.data;
        }
        catch (e) {
            this.logger.error(`Paystack transfer error: ${e.response?.data?.message || e.message}`);
            throw new common_1.BadRequestException(`Paystack transfer failed: ${e.response?.data?.message || e.message}`);
        }
    }
    async getTransferStatus(transferCode) {
        if (!this.secretKey) {
            this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock transfer status');
            return { transfer_code: transferCode, status: 'success' };
        }
        try {
            const response = await axios_1.default.get(`${this.paystackBaseUrl}/transfer/${encodeURIComponent(transferCode)}`, {
                headers: { Authorization: `Bearer ${this.secretKey}` },
            });
            if (!response.data.status) {
                throw new common_1.BadRequestException('Failed to retrieve transfer status from Paystack');
            }
            this.logger.log(`Paystack transfer status fetched for ${transferCode}`);
            return response.data.data;
        }
        catch (e) {
            this.logger.error(`Paystack transfer status error: ${e.response?.data?.message || e.message}`);
            throw new common_1.BadRequestException(`Paystack transfer status lookup failed: ${e.response?.data?.message || e.message}`);
        }
    }
};
exports.PaystackService = PaystackService;
exports.PaystackService = PaystackService = PaystackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PaystackService);
//# sourceMappingURL=paystack.service.js.map