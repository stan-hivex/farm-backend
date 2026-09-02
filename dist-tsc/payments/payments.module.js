"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsModule = void 0;
const common_1 = require("@nestjs/common");
const payments_controller_1 = require("./payments.controller");
const payments_webhook_controller_1 = require("./payments-webhook.controller");
const payments_service_1 = require("./payments.service");
const websocket_module_1 = require("../websocket/websocket.module");
const webhook_module_1 = require("../webhook/webhook.module");
const ivorypay_module_1 = require("../ivorypay/ivorypay.module");
const paystack_module_1 = require("../paystack/paystack.module");
const withdraw_module_1 = require("../withdraw/withdraw.module");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const auth_module_1 = require("../auth/auth.module");
const currency_module_1 = require("../currency/currency.module");
let PaymentsModule = class PaymentsModule {
};
exports.PaymentsModule = PaymentsModule;
exports.PaymentsModule = PaymentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            websocket_module_1.WebsocketModule,
            (0, common_1.forwardRef)(() => webhook_module_1.WebhookModule),
            ivorypay_module_1.IvorypayModule,
            auth_module_1.AuthModule,
            (0, common_1.forwardRef)(() => paystack_module_1.PaystackModule),
            (0, common_1.forwardRef)(() => withdraw_module_1.WithdrawModule),
            currency_module_1.CurrencyModule,
        ],
        controllers: [payments_controller_1.PaymentsController, payments_webhook_controller_1.PaymentsWebhookController],
        providers: [payments_service_1.PaymentsService, kyc_guard_1.KycGuard],
        exports: [payments_service_1.PaymentsService],
    })
], PaymentsModule);
//# sourceMappingURL=payments.module.js.map