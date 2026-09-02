import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { type notification_type } from '@prisma/client';
import { FirebaseService } from './firebase.service';
export declare class NotificationsService {
    private prisma;
    private cfg;
    private firebase;
    private readonly logger;
    private mailer;
    private twilioClient;
    constructor(prisma: PrismaService, cfg: ConfigService, firebase: FirebaseService);
    getDeviceTokens(userId: string): Promise<any>;
    registerDeviceToken(userId: string, token: string, platform?: string): Promise<{
        success: boolean;
    }>;
    removeDeviceToken(userId: string, token: string): Promise<{
        success: boolean;
    }>;
    getSettings(userId: string): Promise<{
        success: boolean;
        data: {
            id: string;
            created_at: Date;
            updated_at: Date;
            deposits: boolean;
            withdrawals: boolean;
            user_id: string;
            language: string;
            theme: string;
            push_notifications: boolean;
            email_notifications: boolean;
            sms_notifications: boolean;
            receive_money_requests: boolean;
            money_sent: boolean;
            money_received: boolean;
            escrow: boolean;
            merchant_payments: boolean;
            security_alerts: boolean;
            promotions: boolean;
            announcements: boolean;
            sound_enabled: boolean;
            vibration_enabled: boolean;
        } | null;
    }>;
    updateSettings(userId: string, body: any): Promise<{
        success: boolean;
        data: {
            id: string;
            created_at: Date;
            updated_at: Date;
            deposits: boolean;
            withdrawals: boolean;
            user_id: string;
            language: string;
            theme: string;
            push_notifications: boolean;
            email_notifications: boolean;
            sms_notifications: boolean;
            receive_money_requests: boolean;
            money_sent: boolean;
            money_received: boolean;
            escrow: boolean;
            merchant_payments: boolean;
            security_alerts: boolean;
            promotions: boolean;
            announcements: boolean;
            sound_enabled: boolean;
            vibration_enabled: boolean;
        };
    }>;
    private normalizeNotificationType;
    createInApp(userId: string, dto: {
        type: notification_type | string;
        title: string;
        body: string;
        metadata?: any;
        entityId?: string;
    }): Promise<{
        id: string;
        created_at: Date | null;
        user_id: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: import("@prisma/client").$Enums.notification_type | null;
        title: string | null;
        body: string | null;
        is_read: boolean | null;
    }>;
    getNotifications(userId: string, query: any): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            type: import("@prisma/client").$Enums.notification_type | null;
            title: string | null;
            body: string | null;
            is_read: boolean | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    markRead(userId: string, id: string): Promise<{
        message: string;
    }>;
    markAllRead(userId: string): Promise<{
        message: string;
    }>;
    deleteNotification(userId: string, id: string): Promise<{
        message: string;
    }>;
    deleteAllNotifications(userId: string): Promise<{
        message: string;
    }>;
    sendEmail(to: string, subject: string, html: string): Promise<void>;
    sendSms(phone: string, message: string): Promise<boolean>;
    sendPush(userId: string, title: string, body: string, data?: Record<string, any>): Promise<boolean>;
    notifyTransfer(senderId: string, receiverId: string, amount: number, reference: string): Promise<void>;
    sendNotification(userId: string | null, dto: {
        type: notification_type | string;
        title: string;
        body: string;
        entityId?: string;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        created_at: Date | null;
        user_id: string | null;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        type: import("@prisma/client").$Enums.notification_type | null;
        title: string | null;
        body: string | null;
        is_read: boolean | null;
    } | null>;
}
