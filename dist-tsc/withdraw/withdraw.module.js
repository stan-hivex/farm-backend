"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawModule = void 0;
const common_1 = require("@nestjs/common");
const withdraw_controller_1 = require("./withdraw.controller");
const withdraw_service_1 = require("./withdraw.service");
const database_module_1 = require("../database/database.module");
const auth_module_1 = require("../auth/auth.module");
const paystack_module_1 = require("../paystack/paystack.module");
const ivorypay_module_1 = require("../ivorypay/ivorypay.module");
const notifications_module_1 = require("../notifications/notifications.module");
const security_module_1 = require("../security/security.module");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const currency_module_1 = require("../currency/currency.module");
let WithdrawModule = class WithdrawModule {
};
exports.WithdrawModule = WithdrawModule;
exports.WithdrawModule = WithdrawModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            (0, common_1.forwardRef)(() => paystack_module_1.PaystackModule),
            notifications_module_1.NotificationsModule,
            ivorypay_module_1.IvorypayModule,
            security_module_1.SecurityModule,
            currency_module_1.CurrencyModule,
        ],
        controllers: [withdraw_controller_1.WithdrawController],
        providers: [withdraw_service_1.WithdrawService, kyc_guard_1.KycGuard],
        exports: [withdraw_service_1.WithdrawService],
    })
], WithdrawModule);
//# sourceMappingURL=withdraw.module.js.map