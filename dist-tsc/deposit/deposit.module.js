"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositModule = void 0;
const common_1 = require("@nestjs/common");
const deposit_controller_1 = require("./deposit.controller");
const deposit_service_1 = require("./deposit.service");
const ivorypay_module_1 = require("../ivorypay/ivorypay.module");
const websocket_module_1 = require("../websocket/websocket.module");
const paystack_module_1 = require("../paystack/paystack.module");
const notifications_module_1 = require("../notifications/notifications.module");
const currency_module_1 = require("../currency/currency.module");
let DepositModule = class DepositModule {
};
exports.DepositModule = DepositModule;
exports.DepositModule = DepositModule = __decorate([
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => ivorypay_module_1.IvorypayModule), websocket_module_1.WebsocketModule, (0, common_1.forwardRef)(() => paystack_module_1.PaystackModule), notifications_module_1.NotificationsModule, currency_module_1.CurrencyModule],
        controllers: [deposit_controller_1.DepositController],
        providers: [deposit_service_1.DepositService],
        exports: [deposit_service_1.DepositService],
    })
], DepositModule);
//# sourceMappingURL=deposit.module.js.map