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
exports.SuperadminController = exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const admin_service_1 = require("./admin.service");
const withdraw_service_1 = require("../withdraw/withdraw.service");
const common_2 = require("@nestjs/common");
const jwt_guard_1 = require("../common/guards/jwt.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const enums_1 = require("../common/enums");
class UserStatusDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UserStatusDto.prototype, "is_active", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UserStatusDto.prototype, "is_suspended", void 0);
class ResolveDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['buyer', 'seller']),
    __metadata("design:type", String)
], ResolveDto.prototype, "winner", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ResolveDto.prototype, "note", void 0);
class MerchantDecisionDto {
}
__decorate([
    (0, class_validator_1.IsIn)(['approved', 'rejected']),
    __metadata("design:type", String)
], MerchantDecisionDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], MerchantDecisionDto.prototype, "rejection_reason", void 0);
class SettingDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SettingDto.prototype, "value", void 0);
class ExchangeRateDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeRateDto.prototype, "base_currency", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExchangeRateDto.prototype, "target_currency", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], ExchangeRateDto.prototype, "rate", void 0);
class ExchangeRatesDto {
}
__decorate([
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", Array)
], ExchangeRatesDto.prototype, "rates", void 0);
class CurrencyRateDto {
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CurrencyRateDto.prototype, "usd_kes_rate", void 0);
class CreateSuperadminDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "first_name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "last_name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "username", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "password", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateSuperadminDto.prototype, "country", void 0);
class UpdateUserDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "first_name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "last_name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "username", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateUserDto.prototype, "is_active", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateUserDto.prototype, "is_suspended", void 0);
class SendNotificationDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationDto.prototype, "user_id", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationDto.prototype, "body", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SendNotificationDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], SendNotificationDto.prototype, "metadata", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SendNotificationDto.prototype, "push", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SendNotificationDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SendNotificationDto.prototype, "sms", void 0);
class BroadcastNotificationDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BroadcastNotificationDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BroadcastNotificationDto.prototype, "body", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BroadcastNotificationDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], BroadcastNotificationDto.prototype, "metadata", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BroadcastNotificationDto.prototype, "push", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BroadcastNotificationDto.prototype, "email", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BroadcastNotificationDto.prototype, "sms", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BroadcastNotificationDto.prototype, "audience", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BroadcastNotificationDto.prototype, "target_role", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BroadcastNotificationDto.prototype, "recipientIds", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BroadcastNotificationDto.prototype, "recipientEmails", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Array)
], BroadcastNotificationDto.prototype, "recipientPhones", void 0);
let AdminController = class AdminController {
    constructor(svc, withdrawService) {
        this.svc = svc;
        this.withdrawService = withdrawService;
    }
    stats() { return this.svc.getDashboardStats(); }
    transactions(q) { return this.svc.listTransactions(q); }
    users(q) { return this.svc.listUsers(q); }
    user(id) { return this.svc.getUserDetail(id); }
    userStatus(id, dto, u) { return this.svc.updateUserStatus(id, dto, u.id); }
    updateUser(id, dto, u) { return this.svc.updateUser(id, dto, u.id); }
    deleteUser(id, u) { return this.svc.deleteUser(id, u.id); }
    escrows(q) { return this.svc.listAllEscrows(q); }
    escrowDetail(id) { return this.svc.getEscrow(id); }
    resolve(id, u, dto) { return this.svc.resolveDispute(id, u.id, dto); }
    merchants(q) { return this.svc.listMerchants(q); }
    merchant(id) { return this.svc.getMerchant(id); }
    decision(id, u, dto) { return this.svc.approveMerchant(id, u.id, dto); }
    payouts(q) { return this.svc.listPayouts(q); }
    fees() { return this.svc.getFees(); }
    updateFee(id, dto, u) { return this.svc.updateFee(id, dto.value, u.id); }
    processPayout(id, u) { return this.svc.processPayout(id, u.id, 'completed'); }
    sendNotification(u, dto) { return this.svc.sendNotification(u.id, dto); }
    broadcastNotification(u, dto) { return this.svc.broadcastNotification(u.id, dto); }
    kycQueue(q) { return this.svc.listKycQueue(q); }
    reviewKyc(id, u, dto) { return this.svc.reviewKyc(id, u.id, dto); }
    analytics() { return this.svc.getAdminAnalytics(); }
    settings() { return this.svc.getSettings(); }
    updateSetting(key, dto, u) { return this.svc.updateSetting(key, dto.value, u.id); }
    getExchangeRates() { return this.svc.getExchangeRates(); }
    updateExchangeRates(dto, u) { return this.svc.updateExchangeRates(dto.rates, u.id); }
    getCurrencyRates() { return this.svc.getCurrencyRates(); }
    updateCurrencyRate(dto, u) { return this.svc.updateCurrencyRate(dto.usd_kes_rate, u.id); }
    auditLogs(q) { return this.svc.getAuditLogs(q); }
    createProject(u, dto) { return this.svc.createProject(u.id, dto); }
    updateProject(id, dto) { return this.svc.updateProject(id, dto); }
    auditDashboard() { return this.svc.getAuditDashboard(); }
    securityEvents(q) { return this.svc.getSecurityEvents(q); }
    securityStats() { return this.svc.getSecurityStats(); }
    userActivity(id, q) { return this.svc.getUserActivityLog(id, q); }
    userSessions(id, q) { return this.svc.getUserSessions(id, q); }
    adminLogs(q) { return this.svc.getAdminAuditLog(q); }
    complianceReport(q) { return this.svc.getComplianceReport(q); }
    allWithdrawals(q) { return this.svc.listAllWithdrawals(q); }
    async processWithdrawal(id, u) {
        const w = await this.withdrawService.getWithdrawal(id);
        if (!w)
            throw new common_2.NotFoundException('Withdrawal not found');
        await this.withdrawService.markAsSuccess(w.reference);
        return { message: 'Withdrawal processed (marked completed)' };
    }
    async getSuperadminWallet(u) {
        return this.svc.getSuperadminWallet(u.id);
    }
    async withdrawSuperadminFunds(u, dto) {
        return this.svc.superadminWithdraw(u.id, dto);
    }
    createSuperadmin(dto, u) {
        return this.svc.createSuperadmin(dto, u.id);
    }
    listSuperadmins(q) {
        return this.svc.listSuperadmins(q);
    }
    getSuperadmin(id) {
        return this.svc.getSuperadmin(id);
    }
    updateSuperadmin(id, dto, u) {
        return this.svc.updateSuperadmin(id, dto, u.id);
    }
    deactivateSuperadmin(id, u) {
        return this.svc.deactivateSuperadmin(id, u.id);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "stats", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('transactions'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "transactions", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "users", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "user", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Patch)('users/:id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UserStatusDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "userStatus", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateUserDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('escrow'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "escrows", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('escrow/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "escrowDetail", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('escrow/:id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, ResolveDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "resolve", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('merchants'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "merchants", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('merchants/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "merchant", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('merchants/:id/decision'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, MerchantDecisionDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "decision", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('payouts'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "payouts", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('fees'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "fees", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Put)('fees/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateFee", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('payouts/:id/process'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "processPayout", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('notifications/send'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, SendNotificationDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "sendNotification", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('notifications/broadcast'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, BroadcastNotificationDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "broadcastNotification", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('kyc/queue'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "kycQueue", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('kyc/:id/review'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, ResolveDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "reviewKyc", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('analytics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "analytics", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "settings", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Put)('settings/:key'),
    __param(0, (0, common_1.Param)('key')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, SettingDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateSetting", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('exchange-rates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getExchangeRates", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Put)('exchange-rates'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ExchangeRatesDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateExchangeRates", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('currency-rates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getCurrencyRates", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Put)('currency-rates'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CurrencyRateDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCurrencyRate", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit-logs'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "auditLogs", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('investments'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createProject", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Put)('investments/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateProject", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "auditDashboard", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/security-events'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "securityEvents", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/security-stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "securityStats", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/users/:id/activity'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "userActivity", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/users/:id/sessions'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "userSessions", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/admin-logs'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "adminLogs", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('audit/compliance'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "complianceReport", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('withdrawals'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "allWithdrawals", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('withdrawals/:id/process'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "processWithdrawal", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Get)('wallet'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getSuperadminWallet", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Post)('wallet/withdraw'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "withdrawSuperadminFunds", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Post)('superadmin/create'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateSuperadminDto, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createSuperadmin", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('superadmin/list'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listSuperadmins", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('superadmin/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getSuperadmin", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Patch)('superadmin/:id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateSuperadmin", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:write'),
    (0, common_1.Post)('superadmin/:id/deactivate'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deactivateSuperadmin", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Controller)({ path: 'admin', version: '1' }),
    __metadata("design:paramtypes", [admin_service_1.AdminService, withdraw_service_1.WithdrawService])
], AdminController);
let SuperadminController = class SuperadminController {
    constructor(svc) {
        this.svc = svc;
    }
    superadminDashboard() {
        return this.svc.getSuperadminDashboard();
    }
    getCurrentCurrencyRate() {
        return this.svc.getCurrentCurrencyRate();
    }
};
exports.SuperadminController = SuperadminController;
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SuperadminController.prototype, "superadminDashboard", null);
__decorate([
    (0, permissions_decorator_1.Permissions)('admin:read'),
    (0, common_1.Get)('currency-rates/current'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SuperadminController.prototype, "getCurrentCurrencyRate", null);
exports.SuperadminController = SuperadminController = __decorate([
    (0, swagger_1.ApiTags)('Superadmin'),
    (0, swagger_1.ApiBearerAuth)('JWT'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.SUPER_ADMIN),
    (0, common_1.Controller)({ path: 'superadmin', version: '1' }),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], SuperadminController);
//# sourceMappingURL=admin.controller.js.map