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
exports.EscrowController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const escrow_service_1 = require("./escrow.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const kyc_guard_1 = require("../common/guards/kyc.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class EscrowAuthDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(4, 6),
    __metadata("design:type", String)
], EscrowAuthDto.prototype, "pin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], EscrowAuthDto.prototype, "biometric_auth", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], EscrowAuthDto.prototype, "device_fingerprint", void 0);
class CreateEscrowDto extends EscrowAuthDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEscrowDto.prototype, "seller_identifier", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], CreateEscrowDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEscrowDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEscrowDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], CreateEscrowDto.prototype, "auto_release_days", void 0);
class DisputeDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DisputeDto.prototype, "reason", void 0);
class MessageDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MessageDto.prototype, "message", void 0);
let EscrowController = class EscrowController {
    constructor(svc) {
        this.svc = svc;
    }
    list(u, q) { return this.svc.list(u.id, q); }
    create(u, dto) { return this.svc.create(u.id, dto); }
    getOne(u, id) { return this.svc.getOne(id, u.id); }
    release(u, id, dto) { return this.svc.release(id, u.id, dto); }
    dispute(u, id, dto) { return this.svc.dispute(id, u.id, dto); }
    cancel(u, id) { return this.svc.cancel(id, u.id); }
    message(u, id, dto) { return this.svc.addMessage(id, u.id, dto.message); }
};
exports.EscrowController = EscrowController;
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:read'),
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "list", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:write'),
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, kyc_guard_1.KycGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateEscrowDto]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "create", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:read'),
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "getOne", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:write'),
    (0, common_1.Post)(':id/release'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, EscrowAuthDto]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "release", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:write'),
    (0, common_1.Post)(':id/dispute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, DisputeDto]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "dispute", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:write'),
    (0, common_1.Post)(':id/cancel'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "cancel", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('escrow:write'),
    (0, common_1.Post)(':id/message'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, MessageDto]),
    __metadata("design:returntype", void 0)
], EscrowController.prototype, "message", null);
exports.EscrowController = EscrowController = __decorate([
    (0, swagger_1.ApiTags)('Escrow'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)({ path: 'escrow', version: '1' }),
    __metadata("design:paramtypes", [escrow_service_1.EscrowService])
], EscrowController);
//# sourceMappingURL=escrow.controller.js.map