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
var AuditLogService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let AuditLogService = AuditLogService_1 = class AuditLogService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AuditLogService_1.name);
    }
    async log(entry) {
        try {
            await this.prisma.audit_logs.create({
                data: {
                    user_id: entry.adminId ?? entry.userId,
                    action: entry.action,
                    entity_type: entry.resource,
                    entity_id: entry.resourceId,
                    old_values: entry.oldValues ?? undefined,
                    new_values: entry.newValues ?? undefined,
                    ip_address: entry.ip,
                    user_agent: entry.userAgent,
                    created_at: entry.timestamp || new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to log audit entry: ${JSON.stringify(entry)}`, error);
        }
    }
    async logUserDeletion(adminId, userId, ip) {
        await this.log({
            adminId,
            action: 'DELETE_USER',
            resource: 'users',
            resourceId: userId,
            status: 'success',
            ip,
        });
    }
    async logUserModification(adminId, userId, oldValues, newValues, ip) {
        await this.log({
            adminId,
            action: 'UPDATE_USER',
            resource: 'users',
            resourceId: userId,
            oldValues,
            newValues,
            status: 'success',
            ip,
        });
    }
    async logMerchantApproval(adminId, merchantId, approved, reason, ip) {
        await this.log({
            adminId,
            action: approved ? 'APPROVE_MERCHANT' : 'REJECT_MERCHANT',
            resource: 'merchants',
            resourceId: merchantId,
            newValues: { approved, reason },
            status: 'success',
            ip,
        });
    }
    async logPayoutProcessing(adminId, payoutId, status, amount, errorMessage, ip) {
        await this.log({
            adminId,
            action: 'PROCESS_PAYOUT',
            resource: 'payouts',
            resourceId: payoutId,
            newValues: { status, amount },
            status,
            errorMessage,
            ip,
        });
    }
    async logSettingsChange(adminId, setting, oldValue, newValue, ip) {
        await this.log({
            adminId,
            action: 'UPDATE_SETTINGS',
            resource: 'settings',
            resourceId: setting,
            oldValues: { value: oldValue },
            newValues: { value: newValue },
            status: 'success',
            ip,
        });
    }
    async logSecurityEvent(adminId, event, details, ip) {
        await this.log({
            adminId,
            action: 'SECURITY_EVENT',
            resource: 'system',
            newValues: details,
            status: 'success',
            ip,
        });
    }
};
exports.AuditLogService = AuditLogService;
exports.AuditLogService = AuditLogService = AuditLogService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditLogService);
//# sourceMappingURL=audit-log.service.js.map