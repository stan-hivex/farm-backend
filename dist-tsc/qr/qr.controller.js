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
exports.QrController = exports.MerchantPayDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const qr_service_1 = require("./qr.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class ValidateQrDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ValidateQrDto.prototype, "qr_payload", void 0);
class MerchantPayDto {
}
exports.MerchantPayDto = MerchantPayDto;
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MerchantPayDto.prototype, "qr_payload", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], MerchantPayDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(4, 6),
    __metadata("design:type", String)
], MerchantPayDto.prototype, "pin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], MerchantPayDto.prototype, "biometric_auth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MerchantPayDto.prototype, "device_fingerprint", void 0);
let QrController = class QrController {
    constructor(svc) {
        this.svc = svc;
    }
    validate(dto, u) { return this.svc.validate(dto.qr_payload, u.id); }
    pay(dto, u) { return this.svc.merchantPay(u.id, dto); }
    receive(u, amount) { return this.svc.generateReceiveQr(u.id, amount); }
};
exports.QrController = QrController;
__decorate([
    (0, permissions_decorator_1.Permissions)('qr:write'),
    (0, common_1.Post)('validate'),
    (0, swagger_1.ApiOperation)({ summary: 'Validate a scanned QR payload' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ValidateQrDto, Object]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "validate", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('qr:write'),
    (0, common_1.Post)('merchant-pay'),
    (0, swagger_1.ApiOperation)({ summary: 'Pay a merchant via QR (PIN required)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [MerchantPayDto, Object]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "pay", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('qr:read'),
    (0, common_1.Get)('receive'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate personal receive QR' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('amount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], QrController.prototype, "receive", null);
exports.QrController = QrController = __decorate([
    (0, swagger_1.ApiTags)('QR'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)({ path: 'qr', version: '1' }),
    __metadata("design:paramtypes", [qr_service_1.QrService])
], QrController);
//# sourceMappingURL=qr.controller.js.map