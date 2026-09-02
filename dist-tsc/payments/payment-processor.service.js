"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PaymentProcessorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentProcessorService = void 0;
const common_1 = require("@nestjs/common");
let PaymentProcessorService = PaymentProcessorService_1 = class PaymentProcessorService {
    constructor() {
        this.logger = new common_1.Logger(PaymentProcessorService_1.name);
    }
    async processDeposit(reference) {
        this.logger.error(`PaymentProcessorService.processDeposit() was called for ${reference} — this method is DEPRECATED. ` +
            'All wallet credit must happen in WebhookService.handlePaystackWebhookProcessing() ' +
            'to ensure HMAC signature verification, amount validation, and fraud detection.');
        throw new Error('PaymentProcessorService.processDeposit() is deprecated. Use WebhookService.finalizeDeposit() instead.');
    }
};
exports.PaymentProcessorService = PaymentProcessorService;
exports.PaymentProcessorService = PaymentProcessorService = PaymentProcessorService_1 = __decorate([
    (0, common_1.Injectable)()
], PaymentProcessorService);
//# sourceMappingURL=payment-processor.service.js.map