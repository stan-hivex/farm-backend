"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransferRequestsModule = void 0;
const common_1 = require("@nestjs/common");
const transfer_requests_controller_1 = require("./transfer-requests.controller");
const transfer_requests_service_1 = require("./transfer-requests.service");
const auth_module_1 = require("../auth/auth.module");
const notifications_module_1 = require("../notifications/notifications.module");
const security_module_1 = require("../security/security.module");
const kyc_guard_1 = require("../common/guards/kyc.guard");
let TransferRequestsModule = class TransferRequestsModule {
};
exports.TransferRequestsModule = TransferRequestsModule;
exports.TransferRequestsModule = TransferRequestsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, notifications_module_1.NotificationsModule, security_module_1.SecurityModule],
        controllers: [transfer_requests_controller_1.TransferRequestsController],
        providers: [transfer_requests_service_1.TransferRequestsService, kyc_guard_1.KycGuard],
        exports: [transfer_requests_service_1.TransferRequestsService],
    })
], TransferRequestsModule);
//# sourceMappingURL=transfer-requests.module.js.map