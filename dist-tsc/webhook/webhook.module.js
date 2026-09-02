"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const schedule_1 = require("@nestjs/schedule");
const webhook_controller_1 = require("./webhook.controller");
const webhook_service_1 = require("./webhook.service");
const webhook_processor_1 = require("./webhook.processor");
const payment_processor_1 = require("./payment.processor");
const deposit_module_1 = require("../deposit/deposit.module");
const withdraw_module_1 = require("../withdraw/withdraw.module");
const websocket_module_1 = require("../websocket/websocket.module");
const payments_module_1 = require("../payments/payments.module");
const paystack_module_1 = require("../paystack/paystack.module");
const ivorypay_module_1 = require("../ivorypay/ivorypay.module");
const notifications_module_1 = require("../notifications/notifications.module");
const prisma_service_1 = require("../database/prisma.service");
const webhook_signature_guard_1 = require("../common/guards/webhook-signature.guard");
const constants_1 = require("../common/constants");
let WebhookModule = class WebhookModule {
};
exports.WebhookModule = WebhookModule;
exports.WebhookModule = WebhookModule = __decorate([
    (0, common_1.Module)({
        imports: [
            (0, common_1.forwardRef)(() => deposit_module_1.DepositModule),
            (0, common_1.forwardRef)(() => withdraw_module_1.WithdrawModule),
            websocket_module_1.WebsocketModule,
            (0, common_1.forwardRef)(() => payments_module_1.PaymentsModule),
            (0, common_1.forwardRef)(() => paystack_module_1.PaystackModule),
            (0, common_1.forwardRef)(() => ivorypay_module_1.IvorypayModule),
            notifications_module_1.NotificationsModule,
            schedule_1.ScheduleModule.forRoot(),
            bull_1.BullModule.registerQueue({
                name: constants_1.QUEUES.WEBHOOKS,
            }),
        ],
        controllers: [
            webhook_controller_1.WebhookController,
            webhook_controller_1.WebhookNoVersionController,
            webhook_controller_1.IvorypayWebhookAliasController,
            webhook_controller_1.IvorypayWebhookNoVersionController,
        ],
        providers: [
            webhook_service_1.WebhookService,
            webhook_processor_1.WebhookProcessor,
            payment_processor_1.PaymentProcessor,
            prisma_service_1.PrismaService,
            webhook_signature_guard_1.WebhookSignatureGuard,
        ],
        exports: [webhook_service_1.WebhookService],
    })
], WebhookModule);
//# sourceMappingURL=webhook.module.js.map