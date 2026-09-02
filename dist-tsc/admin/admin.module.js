"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const admin_controller_1 = require("./admin.controller");
const admin_service_1 = require("./admin.service");
const escrow_module_1 = require("../escrow/escrow.module");
const notifications_module_1 = require("../notifications/notifications.module");
const withdraw_module_1 = require("../withdraw/withdraw.module");
const auth_module_1 = require("../auth/auth.module");
const currency_module_1 = require("../currency/currency.module");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({ imports: [auth_module_1.AuthModule, escrow_module_1.EscrowModule, notifications_module_1.NotificationsModule, withdraw_module_1.WithdrawModule, currency_module_1.CurrencyModule], controllers: [admin_controller_1.AdminController, admin_controller_1.SuperadminController], providers: [admin_service_1.AdminService] })
], AdminModule);
//# sourceMappingURL=admin.module.js.map