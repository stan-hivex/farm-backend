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
var PaymentsWebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsWebhookController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const webhook_service_1 = require("../webhook/webhook.service");
let PaymentsWebhookController = PaymentsWebhookController_1 = class PaymentsWebhookController {
    constructor(webhookService) {
        this.webhookService = webhookService;
        this.logger = new common_2.Logger(PaymentsWebhookController_1.name);
        this.logger.log('Registered route: /api/v1/payments/webhooks/ivorypay (GET, POST)');
    }
    health() {
        this.logger.log('Ivorypay webhook health check reached');
        return { success: true, message: 'Ivorypay webhook endpoint is alive' };
    }
    async ivorypay(req, body) {
        try {
            this.logger.log('Ivorypay webhook reached');
            try {
                this.logger.log(`Ivorypay webhook headers: ${JSON.stringify(req.headers || {}, null, 2)}`);
            }
            catch (e) {
                this.logger.warn('Failed to stringify headers for logging');
            }
            try {
                this.logger.log(`Ivorypay webhook rawBody: ${typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.rawBody)}`);
            }
            catch (e) {
                this.logger.warn('Failed to log rawBody');
            }
            try {
                this.logger.log(`Ivorypay webhook parsed body: ${JSON.stringify(body, null, 2)}`);
            }
            catch (e) {
                this.logger.warn('Failed to stringify parsed body for logging');
            }
            const result = await this.webhookService.handleIvorypayWebhook(body, false);
            this.logger.log(`Ivorypay webhook handler result: ${JSON.stringify(result)}`);
            return result ?? { received: true };
        }
        catch (err) {
            this.logger.error('Ivorypay webhook handler exception', err);
            return { received: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    async triggerFix() {
        this.logger.log('Manual trigger invoked: fixStuckDeposits');
        try {
            await this.webhookService.fixStuckDeposits();
            return { ok: true, message: 'fixStuckDeposits triggered' };
        }
        catch (e) {
            this.logger.error('Manual trigger failed', e);
            return { ok: false, error: e?.message ?? String(e) };
        }
    }
};
exports.PaymentsWebhookController = PaymentsWebhookController;
__decorate([
    (0, common_1.Get)('ivorypay'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PaymentsWebhookController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('ivorypay'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaymentsWebhookController.prototype, "ivorypay", null);
__decorate([
    (0, common_1.Post)('ivorypay/trigger-fix'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsWebhookController.prototype, "triggerFix", null);
exports.PaymentsWebhookController = PaymentsWebhookController = PaymentsWebhookController_1 = __decorate([
    (0, common_1.Controller)({ path: 'payments/webhooks', version: '1' }),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], PaymentsWebhookController);
//# sourceMappingURL=payments-webhook.controller.js.map