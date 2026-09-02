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
var SecurityController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const security_service_1 = require("./security.service");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
class UpdateBiometricsDto {
}
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateBiometricsDto.prototype, "enabled", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBiometricsDto.prototype, "deviceFingerprint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateBiometricsDto.prototype, "biometricType", void 0);
class VerifyDeviceDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyDeviceDto.prototype, "deviceFingerprint", void 0);
class CreateBiometricsDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBiometricsDto.prototype, "deviceFingerprint", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBiometricsDto.prototype, "biometricType", void 0);
let SecurityController = SecurityController_1 = class SecurityController {
    constructor(svc) {
        this.svc = svc;
        this.logger = new common_1.Logger(SecurityController_1.name);
    }
    settings(user) {
        this.logger.log(`settings requested by user=${user?.id || 'anon'}`);
        return this.svc.getSettings(user.id);
    }
    async updateBiometrics(user, dto) {
        this.logger.log(`Biometric update requested by user=${user?.id}, enabled=${dto.enabled}`);
        if (dto.enabled) {
            if (!dto.deviceFingerprint) {
                throw new common_1.BadRequestException('deviceFingerprint is required when enabling biometrics');
            }
            return this.svc.enableBiometrics(user.id, dto.deviceFingerprint, dto.biometricType);
        }
        else {
            return this.svc.disableBiometrics(user.id);
        }
    }
    async verifyDevice(user, dto) {
        this.logger.log(`Device verification requested by user=${user?.id}`);
        return this.svc.verifyDevice(user.id, dto.deviceFingerprint);
    }
    async createBiometrics(user, dto) {
        this.logger.log(`Create biometric requested by user=${user?.id}`);
        if (!dto.deviceFingerprint) {
            throw new common_1.BadRequestException('deviceFingerprint is required');
        }
        return this.svc.enableBiometrics(user.id, dto.deviceFingerprint, dto.biometricType);
    }
    async getBiometricStatus(user) {
        this.logger.log(`Biometric status requested by user=${user?.id}`);
        return this.svc.getBiometricStatus(user.id);
    }
    async deleteBiometrics(user) {
        this.logger.log(`Delete biometric requested by user=${user?.id}`);
        return this.svc.deleteBiometrics(user.id);
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, permissions_decorator_1.Permissions)('security:read'),
    (0, common_1.Get)('settings'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "settings", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('security:write'),
    (0, common_1.Put)('biometrics'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Enable or disable biometric authentication' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateBiometricsDto]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "updateBiometrics", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('security:write'),
    (0, common_1.Post)('verify-device'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Verify device fingerprint on app resume' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, VerifyDeviceDto]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "verifyDevice", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('security:write'),
    (0, common_1.Post)('biometrics'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Enable biometric authentication for this device' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateBiometricsDto]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "createBiometrics", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('security:read'),
    (0, common_1.Get)('biometrics'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get biometric settings status' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "getBiometricStatus", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('security:write'),
    (0, common_1.Delete)('biometrics'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Delete biometric trusted device or disable biometrics' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "deleteBiometrics", null);
exports.SecurityController = SecurityController = SecurityController_1 = __decorate([
    (0, swagger_1.ApiTags)('Security'),
    (0, common_1.Controller)({ path: 'security', version: '1' }),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map