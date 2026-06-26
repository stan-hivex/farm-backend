import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface AuditLogEntry {
  userId?: string;
  adminId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  timestamp?: Date;
}

/**
 * Immutable Audit Logging Service
 * All admin operations should be logged for compliance and forensics
 * Audit logs should NEVER be modified or deleted
 */
@Injectable()
export class AuditLogService {
  private logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an admin action
   * Automatically captures timestamp and ensures immutability
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.audit_logs.create({
        data: {
          user_id: entry.adminId ?? entry.userId,
          action: entry.action,
          entity_type: entry.resource,
          entity_id: entry.resourceId,
          // Prisma Json type accepts JS objects directly; prefer objects over JSON values
          old_values: entry.oldValues ?? undefined,
          new_values: entry.newValues ?? undefined,
          ip_address: entry.ip,
          user_agent: entry.userAgent,
          created_at: entry.timestamp || new Date(),
        },
      });
    } catch (error) {
      // Log errors but don't throw - audit logging should not break the app
      this.logger.error(`Failed to log audit entry: ${JSON.stringify(entry)}`, error);
    }
  }

  /**
   * Log user deletion
   */
  async logUserDeletion(adminId: string, userId: string, ip?: string) {
    await this.log({
      adminId,
      action: 'DELETE_USER',
      resource: 'users',
      resourceId: userId,
      status: 'success',
      ip,
    });
  }

  /**
   * Log user modification
   */
  async logUserModification(
    adminId: string,
    userId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>,
    ip?: string,
  ) {
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

  /**
   * Log merchant approval/rejection
   */
  async logMerchantApproval(
    adminId: string,
    merchantId: string,
    approved: boolean,
    reason?: string,
    ip?: string,
  ) {
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

  /**
   * Log payout processing
   */
  async logPayoutProcessing(
    adminId: string,
    payoutId: string,
    status: 'success' | 'failure',
    amount?: number,
    errorMessage?: string,
    ip?: string,
  ) {
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

  /**
   * Log settings change
   */
  async logSettingsChange(
    adminId: string,
    setting: string,
    oldValue: any,
    newValue: any,
    ip?: string,
  ) {
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

  /**
   * Log security-relevant events (role changes, permission grants, etc)
   */
  async logSecurityEvent(
    adminId: string,
    event: string,
    details: Record<string, any>,
    ip?: string,
  ) {
    await this.log({
      adminId,
      action: 'SECURITY_EVENT',
      resource: 'system',
      newValues: details,
      status: 'success',
      ip,
    });
  }
}
