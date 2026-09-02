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
exports.MerchantsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const merchants_service_1 = require("./merchants.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class ApplyDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "business_name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "business_type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "business_email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "business_phone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ApplyDto.prototype, "city", void 0);
class PayoutDto {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], PayoutDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayoutDto.prototype, "payout_method", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayoutDto.prototype, "account_name", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PayoutDto.prototype, "account_number", void 0);
let MerchantsController = class MerchantsController {
    constructor(svc) {
        this.svc = svc;
    }
    apply(u, dto) { return this.svc.apply(u.id, dto); }
    get(u) { return this.svc.getMyMerchant(u.id); }
    dashboard(u) { return this.svc.getDashboard(u.id); }
    getQr(u) { return this.svc.getMerchantQr(u.id); }
    transactions(u, q) { return this.svc.getTransactions(u.id, q); }
    payout(u, dto) { return this.svc.requestPayout(u.id, dto); }
    payouts(u, q) { return this.svc.getPayouts(u.id, q); }
    regenQr(u) { return this.svc.regenerateQr(u.id); }
};
exports.MerchantsController = MerchantsController;
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:write'),
    (0, common_1.Post)('apply'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ApplyDto]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "apply", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:read'),
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "get", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:read'),
    (0, common_1.Get)('dashboard'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "dashboard", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:read'),
    (0, common_1.Get)('qr'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "getQr", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:read'),
    (0, common_1.Get)('transactions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "transactions", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:write'),
    (0, common_1.Post)('payout'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, PayoutDto]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "payout", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:read'),
    (0, common_1.Get)('payouts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "payouts", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('merchant:write'),
    (0, common_1.Post)('qr/regenerate'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MerchantsController.prototype, "regenQr", null);
exports.MerchantsController = MerchantsController = __decorate([
    (0, swagger_1.ApiTags)('Merchants'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)({ path: 'merchant', version: '1' }),
    __metadata("design:paramtypes", [merchants_service_1.MerchantsService])
], MerchantsController);
//# sourceMappingURL=merchants.controller.js.map