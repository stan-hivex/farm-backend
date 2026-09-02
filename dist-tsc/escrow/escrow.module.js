"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const escrow_controller_1 = require("./escrow.controller");
const escrow_service_1 = require("./escrow.service");
const auth_module_1 = require("../auth/auth.module");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const paystack_module_1 = require("../paystack/paystack.module");
const notifications_module_1 = require("../notifications/notifications.module");
const security_module_1 = require("../security/security.module");
const transfer_requests_module_1 = require("../transfer-requests/transfer-requests.module");
const expiry_tasks_processor_1 = require("../common/tasks/expiry-tasks.processor");
let EscrowModule = class EscrowModule {
};
exports.EscrowModule = EscrowModule;
exports.EscrowModule = EscrowModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            paystack_module_1.PaystackModule,
            notifications_module_1.NotificationsModule,
            security_module_1.SecurityModule,
            transfer_requests_module_1.TransferRequestsModule,
            bull_1.BullModule.registerQueue({ name: 'expiry-tasks' }),
        ],
        controllers: [escrow_controller_1.EscrowController],
        providers: [escrow_service_1.EscrowService, kyc_guard_1.KycGuard, expiry_tasks_processor_1.ExpiryTasksProcessor],
        exports: [escrow_service_1.EscrowService],
    })
], EscrowModule);
//# sourceMappingURL=escrow.module.js.map