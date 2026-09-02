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
var StkPushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StkPushService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let StkPushService = StkPushService_1 = class StkPushService {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(StkPushService_1.name);
        this.baseUrl = this.cfg.get('STK_PUSH_BASE_URL', 'https://sandbox.safaricom.co.ke');
        this.consumerKey = this.cfg.get('STK_PUSH_CONSUMER_KEY') || '';
        this.consumerSecret = this.cfg.get('STK_PUSH_CONSUMER_SECRET') || '';
        this.shortCode = this.cfg.get('STK_PUSH_SHORTCODE') || '';
        this.passKey = this.cfg.get('STK_PUSH_PASSKEY') || '';
        this.callbackUrl = this.cfg.get('STK_PUSH_CALLBACK_URL', 'https://app.farm/webhooks/stk-push');
        this.transactionType = this.cfg.get('STK_PUSH_TRANSACTION_TYPE', 'CustomerPayBillOnline');
        this.enabled = this.cfg.get('STK_PUSH_ENABLED', 'false').toLowerCase() === 'true';
        if (this.enabled && (!this.consumerKey || !this.consumerSecret || !this.shortCode || !this.passKey)) {
            this.logger.warn('STK push provider is enabled but not fully configured. Make sure STK_PUSH_* config values are set.');
        }
    }
    formatPhone(phone) {
        const candidate = String(phone || '').trim().replace(/[^0-9]/g, '');
        if (!candidate) {
            throw new common_1.BadRequestException('Phone number is required for STK push');
        }
        if (candidate.startsWith('0')) {
            return `254${candidate.slice(1)}`;
        }
        if (candidate.startsWith('7') && candidate.length === 9) {
            return `254${candidate}`;
        }
        if (candidate.startsWith('254') && candidate.length === 12) {
            return candidate;
        }
        throw new common_1.BadRequestException('STK push phone number must be a Kenyan number starting with 254 or 0');
    }
    formatTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    }
    formatPassword(timestamp) {
        return Buffer.from(`${this.shortCode}${this.passKey}${timestamp}`).toString('base64');
    }
    async getAccessToken() {
        if (!this.consumerKey || !this.consumerSecret) {
            throw new common_1.BadRequestException('Missing STK push credentials');
        }
        const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
        const response = await axios_1.default.get(url, {
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });
        const token = response.data?.access_token;
        if (!token) {
            throw new common_1.BadRequestException('Unable to obtain STK push access token');
        }
        return token;
    }
    async initiatePush(data) {
        if (!this.enabled || !this.consumerKey || !this.consumerSecret || !this.shortCode || !this.passKey) {
            throw new common_1.BadRequestException('STK push is not configured for this environment. Set STK_PUSH_ENABLED=true and the required STK_PUSH_* values.');
        }
        const phoneNumber = this.formatPhone(data.phone);
        const timestamp = this.formatTimestamp();
        const password = this.formatPassword(timestamp);
        const accessToken = await this.getAccessToken();
        const payload = {
            BusinessShortCode: this.shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: this.transactionType,
            Amount: Math.round(data.amount),
            PartyA: phoneNumber,
            PartyB: this.shortCode,
            PhoneNumber: phoneNumber,
            CallBackURL: this.callbackUrl,
            AccountReference: data.accountReference || data.reference,
            TransactionDesc: data.description || `Deposit request ${data.reference}`,
        };
        const response = await axios_1.default.post(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.data) {
            throw new common_1.BadRequestException('Empty STK push response');
        }
        return response.data;
    }
};
exports.StkPushService = StkPushService;
exports.StkPushService = StkPushService = StkPushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StkPushService);
//# sourceMappingURL=stk.service.js.map