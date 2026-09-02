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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const payments_service_1 = require("./payments.service");
const device_token_util_1 = require("../common/utils/device-token.util");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
class DepositDto {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], DepositDto.prototype, "amount_fiat", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DepositDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DepositDto.prototype, "paymentMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DepositDto.prototype, "phone", void 0);
let PaymentsController = class PaymentsController {
    constructor(svc) {
        this.svc = svc;
    }
    deposit(u, dto, req) {
        let deviceRisk = 0;
        const token = req.headers['x-device-token'] || '';
        if (token) {
            const p = (0, device_token_util_1.verifyDeviceToken)(token);
            if (p && typeof p.deviceRisk !== 'undefined')
                deviceRisk = Number(p.deviceRisk) || 0;
        }
        else {
            const header = req.headers['x-device-risk'] || req.headers['x-device-risk-score'];
            deviceRisk = header ? Number(header) || 0 : 0;
        }
        return this.svc.initiateDeposit(u.id, dto, { deviceRisk, ip: req.ip || '' });
    }
    deposits(u) {
        return this.svc.getDepositHistory(u.id);
    }
    withdrawals(u) {
        return this.svc.getWithdrawalHistory(u.id);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:write'),
    (0, common_1.Post)('deposit'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Initiate a fiat deposit (CARD, MOBILE_MONEY, CRYPTO, BANK_TRANSFER)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, DepositDto, Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "deposit", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, common_1.Get)('deposits'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get deposit history' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "deposits", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('payments:read'),
    (0, common_1.Get)('withdrawals'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get withdrawal history' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PaymentsController.prototype, "withdrawals", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('Payments'),
    (0, common_1.Controller)({ path: 'payments', version: '1' }),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map