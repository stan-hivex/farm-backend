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
var PaymentProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProcessor = void 0;
const common_1 = require("@nestjs/common");
const webhook_service_1 = require("./webhook.service");
let PaymentProcessor = PaymentProcessor_1 = class PaymentProcessor {
    constructor(webhookService) {
        this.webhookService = webhookService;
        this.logger = new common_1.Logger(PaymentProcessor_1.name);
    }
    async process(job) {
        if (!job || !job.provider) {
            this.logger.warn('Received invalid webhook job');
            return;
        }
        try {
            if (job.provider === 'paystack') {
                await this.webhookService.handlePaystackWebhookProcessing(job.payload);
            }
            else if (job.provider === 'ivorypay') {
                await this.webhookService.handleIvorypayWebhookProcessing(job.payload);
            }
            else {
                this.logger.warn(`Unsupported webhook provider: ${job.provider}`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to process webhook job: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
};
exports.PaymentProcessor = PaymentProcessor;
exports.PaymentProcessor = PaymentProcessor = PaymentProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], PaymentProcessor);
//# sourceMappingURL=payment.processor.js.map