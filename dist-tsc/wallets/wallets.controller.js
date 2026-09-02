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
exports.WalletsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const wallets_service_1 = require("./wallets.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const email_verified_guard_1 = require("../common/guards/email-verified.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class SendFundsDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendFundsDto.prototype, "recipient_identifier", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], SendFundsDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(4, 6),
    __metadata("design:type", String)
], SendFundsDto.prototype, "pin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], SendFundsDto.prototype, "biometric_auth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendFundsDto.prototype, "device_fingerprint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendFundsDto.prototype, "description", void 0);
let WalletsController = class WalletsController {
    constructor(svc) {
        this.svc = svc;
    }
    getWallet(u) { return this.svc.getMyWallet(u.id); }
    send(u, dto, req) {
        return this.svc.sendFunds(u.id, dto, req.ip || '');
    }
    transactions(u, q) {
        return this.svc.getTransactions(u.id, q);
    }
};
exports.WalletsController = WalletsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('wallet:read'),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get my wallet balance' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WalletsController.prototype, "getWallet", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('wallet:write'),
    (0, common_1.Post)('send'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, email_verified_guard_1.EmailVerifiedGuard, kyc_guard_1.KycGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Send FARM tokens (PIN required)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, SendFundsDto, Object]),
    __metadata("design:returntype", void 0)
], WalletsController.prototype, "send", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('wallet:read'),
    (0, common_1.Get)('transactions'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, email_verified_guard_1.EmailVerifiedGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List my transactions' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WalletsController.prototype, "transactions", null);
exports.WalletsController = WalletsController = __decorate([
    (0, swagger_1.ApiTags)('Wallet'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, common_1.Controller)({ path: 'wallet', version: '1' }),
    __metadata("design:paramtypes", [wallets_service_1.WalletsService])
], WalletsController);
//# sourceMappingURL=wallets.controller.js.map