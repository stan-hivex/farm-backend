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
var WebhookProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const bull_2 = require("@nestjs/bull");
const payment_processor_1 = require("./payment.processor");
const constants_1 = require("../common/constants");
let WebhookProcessor = WebhookProcessor_1 = class WebhookProcessor {
    constructor(paymentProcessor, queue) {
        this.paymentProcessor = paymentProcessor;
        this.queue = queue;
        this.logger = new common_1.Logger(WebhookProcessor_1.name);
    }
    async onModuleInit() {
        try {
            await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'failed', 1000);
            await this.queue.clean(24 * 60 * 60 * 1000, 'completed', 1000);
            this.logger.log('Cleaned aged webhook queue jobs');
        }
        catch (error) {
            this.logger.warn(`Failed to clean aged webhook queue jobs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleWebhookJob(job) {
        return this.processWebhookQueue(job);
    }
    async processWebhookQueue(job) {
        if (!job?.data) {
            this.logger.warn('Received empty webhook job');
            return;
        }
        try {
            await this.paymentProcessor.process(job.data);
        }
        catch (error) {
            this.logger.error(`Failed to process webhook job: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
};
exports.WebhookProcessor = WebhookProcessor;
__decorate([
    (0, bull_2.Process)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookProcessor.prototype, "handleWebhookJob", null);
exports.WebhookProcessor = WebhookProcessor = WebhookProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bull_2.Processor)(constants_1.QUEUES.WEBHOOKS),
    __param(1, (0, bull_1.InjectQueue)(constants_1.QUEUES.WEBHOOKS)),
    __metadata("design:paramtypes", [payment_processor_1.PaymentProcessor, Object])
], WebhookProcessor);
//# sourceMappingURL=webhook.processor.js.map