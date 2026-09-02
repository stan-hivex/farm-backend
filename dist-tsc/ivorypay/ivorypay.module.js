"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IvorypayModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ivorypay_service_1 = require("./ivorypay.service");
const ivorypay_deposit_service_1 = require("./ivorypay-deposit.service");
const crypto_controller_1 = require("./crypto.controller");
const prisma_module_1 = require("../database/prisma.module");
const notifications_module_1 = require("../notifications/notifications.module");
const websocket_module_1 = require("../websocket/websocket.module");
const currency_module_1 = require("../currency/currency.module");
let IvorypayModule = class IvorypayModule {
};
exports.IvorypayModule = IvorypayModule;
exports.IvorypayModule = IvorypayModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, prisma_module_1.PrismaModule, notifications_module_1.NotificationsModule, websocket_module_1.WebsocketModule, currency_module_1.CurrencyModule],
        controllers: [crypto_controller_1.CryptoController],
        providers: [ivorypay_service_1.IvorypayService, ivorypay_deposit_service_1.IvorypayDepositService],
        exports: [ivorypay_service_1.IvorypayService, ivorypay_deposit_service_1.IvorypayDepositService],
    })
], IvorypayModule);
//# sourceMappingURL=ivorypay.module.js.map