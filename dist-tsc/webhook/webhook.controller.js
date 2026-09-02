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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IvorypayWebhookNoVersionController = exports.IvorypayWebhookAliasController = exports.WebhookNoVersionController = exports.WebhookController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const webhook_service_1 = require("./webhook.service");
const webhook_signature_guard_1 = require("../common/guards/webhook-signature.guard");
let WebhookController = class WebhookController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    getWebhookJobId(provider, payload) {
        const eventId = payload.id ?? payload.data?.id ?? payload.data?.reference ?? payload.reference;
        return eventId ? `${provider}:${eventId}` : `${provider}:anonymous:${Date.now()}`;
    }
    async paystack(body) {
        await this.webhookService.handlePaystackWebhook(body, true);
        return { received: true };
    }
    async ivorypay(body) {
        await this.webhookService.handleIvorypayWebhook(body, true);
        return { received: true };
    }
    async ivorypayHealth() {
        return { status: 'ok', provider: 'ivorypay' };
    }
};
exports.WebhookController = WebhookController;
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, throttler_1.Throttle)({
        default: {
            limit: 20,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('paystack'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookController.prototype, "paystack", null);
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, throttler_1.Throttle)({
        default: {
            limit: 20,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('ivorypay'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookController.prototype, "ivorypay", null);
__decorate([
    (0, common_1.Get)('ivorypay'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WebhookController.prototype, "ivorypayHealth", null);
exports.WebhookController = WebhookController = __decorate([
    (0, common_1.Controller)({
        path: 'webhooks',
        version: '1',
    }),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], WebhookController);
let WebhookNoVersionController = class WebhookNoVersionController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    async paystack(body) {
        await this.webhookService.handlePaystackWebhook(body, true);
        return { received: true };
    }
    async ivorypay(body) {
        await this.webhookService.handleIvorypayWebhook(body, true);
        return { received: true };
    }
    async ivorypayHealth() {
        return { status: 'ok', provider: 'ivorypay', version: 'none' };
    }
};
exports.WebhookNoVersionController = WebhookNoVersionController;
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, throttler_1.Throttle)({
        default: {
            limit: 20,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('paystack'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookNoVersionController.prototype, "paystack", null);
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, throttler_1.Throttle)({
        default: {
            limit: 20,
            ttl: 60000,
        },
    }),
    (0, common_1.Post)('ivorypay'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookNoVersionController.prototype, "ivorypay", null);
__decorate([
    (0, common_1.Get)('ivorypay'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WebhookNoVersionController.prototype, "ivorypayHealth", null);
exports.WebhookNoVersionController = WebhookNoVersionController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], WebhookNoVersionController);
let IvorypayWebhookAliasController = class IvorypayWebhookAliasController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    async webhookHealth() {
        return { status: 'ok', provider: 'ivorypay' };
    }
    async webhook(body) {
        await this.webhookService.handleIvorypayWebhook(body, true);
        return { received: true };
    }
};
exports.IvorypayWebhookAliasController = IvorypayWebhookAliasController;
__decorate([
    (0, common_1.Get)('webhook'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IvorypayWebhookAliasController.prototype, "webhookHealth", null);
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IvorypayWebhookAliasController.prototype, "webhook", null);
exports.IvorypayWebhookAliasController = IvorypayWebhookAliasController = __decorate([
    (0, common_1.Controller)({
        path: 'ivorypay',
        version: '1',
    }),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], IvorypayWebhookAliasController);
let IvorypayWebhookNoVersionController = class IvorypayWebhookNoVersionController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }
    async webhookHealth() {
        return { status: 'ok', provider: 'ivorypay', version: 'none' };
    }
    async webhook(body) {
        await this.webhookService.handleIvorypayWebhook(body, true);
        return { received: true };
    }
};
exports.IvorypayWebhookNoVersionController = IvorypayWebhookNoVersionController;
__decorate([
    (0, common_1.Get)('webhook'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IvorypayWebhookNoVersionController.prototype, "webhookHealth", null);
__decorate([
    (0, common_1.UseGuards)(webhook_signature_guard_1.WebhookSignatureGuard),
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IvorypayWebhookNoVersionController.prototype, "webhook", null);
exports.IvorypayWebhookNoVersionController = IvorypayWebhookNoVersionController = __decorate([
    (0, common_1.Controller)('ivorypay'),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], IvorypayWebhookNoVersionController);
//# sourceMappingURL=webhook.controller.js.map