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
export declare class AuditLogService {
    private prisma;
    private logger;
    constructor(prisma: PrismaService);
    log(entry: AuditLogEntry): Promise<void>;
    logUserDeletion(adminId: string, userId: string, ip?: string): Promise<void>;
    logUserModification(adminId: string, userId: string, oldValues: Record<string, any>, newValues: Record<string, any>, ip?: string): Promise<void>;
    logMerchantApproval(adminId: string, merchantId: string, approved: boolean, reason?: string, ip?: string): Promise<void>;
    logPayoutProcessing(adminId: string, payoutId: string, status: 'success' | 'failure', amount?: number, errorMessage?: string, ip?: string): Promise<void>;
    logSettingsChange(adminId: string, setting: string, oldValue: any, newValue: any, ip?: string): Promise<void>;
    logSecurityEvent(adminId: string, event: string, details: Record<string, any>, ip?: string): Promise<void>;
}
