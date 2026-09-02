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
var WebhookSignatureGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookSignatureGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let WebhookSignatureGuard = WebhookSignatureGuard_1 = class WebhookSignatureGuard {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(WebhookSignatureGuard_1.name);
    }
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        if (req.path.includes('paystack')) {
            return this.verifyPaystack(req);
        }
        if (req.path.includes('ivorypay')) {
            return this.verifyIvorypay(req);
        }
        this.logger.warn(`Unknown webhook path: ${req.path}`);
        throw new common_1.UnauthorizedException('Unknown webhook provider');
    }
    verifyPaystack(req) {
        const secret = this.cfg.get('PAYSTACK_WEBHOOK_SECRET');
        if (!secret) {
            this.logger.error('PAYSTACK_WEBHOOK_SECRET not set — rejecting webhook');
            throw new common_1.UnauthorizedException('Webhook secret not configured');
        }
        const paystackSignature = req.headers['x-paystack-signature'];
        if (!paystackSignature) {
            throw new common_1.UnauthorizedException('Missing Paystack signature header');
        }
        const rawBody = req.rawBody;
        if (!rawBody) {
            this.logger.error('Raw body not available — ensure rawBody middleware is configured');
            throw new common_1.UnauthorizedException('Cannot verify signature without raw body');
        }
        const expected = (0, crypto_1.createHmac)('sha512', secret)
            .update(rawBody)
            .digest('hex');
        try {
            const sigBuffer = Buffer.from(paystackSignature, 'hex');
            const expectedBuffer = Buffer.from(expected, 'hex');
            if (sigBuffer.length !== expectedBuffer.length) {
                throw new common_1.UnauthorizedException('Paystack signature mismatch');
            }
            if (!(0, crypto_1.timingSafeEqual)(sigBuffer, expectedBuffer)) {
                throw new common_1.UnauthorizedException('Paystack signature mismatch');
            }
        }
        catch (e) {
            if (e instanceof common_1.UnauthorizedException)
                throw e;
            throw new common_1.UnauthorizedException('Paystack signature verification failed');
        }
        return true;
    }
    verifyIvorypay(req) {
        const secret = this.cfg.get('IVORYPAY_WEBHOOK_SECRET');
        if (!secret) {
            this.logger.error('IVORYPAY_WEBHOOK_SECRET not set — rejecting webhook');
            throw new common_1.UnauthorizedException('Webhook secret not configured');
        }
        const signature = req.headers['x-ivorypay-signature'];
        if (!signature)
            throw new common_1.UnauthorizedException('Missing Ivorypay signature header');
        const rawBody = req.rawBody;
        if (!rawBody)
            throw new common_1.UnauthorizedException('Cannot verify signature without raw body');
        let payloadData;
        try {
            const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
            payloadData = JSON.stringify(parsed.data ?? parsed);
        }
        catch (e) {
            this.logger.error('Ivorypay signature verification failed: invalid JSON payload');
            throw new common_1.UnauthorizedException('Ivorypay signature verification failed');
        }
        const expected = (0, crypto_1.createHmac)('sha512', secret).update(payloadData).digest('hex');
        try {
            const sigBuffer = Buffer.from(signature, 'hex');
            const expectedBuffer = Buffer.from(expected, 'hex');
            if (sigBuffer.length !== expectedBuffer.length || !(0, crypto_1.timingSafeEqual)(sigBuffer, expectedBuffer)) {
                throw new common_1.UnauthorizedException('Ivorypay signature mismatch');
            }
        }
        catch (e) {
            if (e instanceof common_1.UnauthorizedException)
                throw e;
            throw new common_1.UnauthorizedException('Ivorypay signature verification failed');
        }
        return true;
    }
};
exports.WebhookSignatureGuard = WebhookSignatureGuard;
exports.WebhookSignatureGuard = WebhookSignatureGuard = WebhookSignatureGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WebhookSignatureGuard);
//# sourceMappingURL=webhook-signature.guard.js.map