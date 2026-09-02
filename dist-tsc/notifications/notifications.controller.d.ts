import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    getSettings(req: any): Promise<{
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
    updateSettings(req: any, body: any): Promise<{
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
    registerDeviceToken(req: any, body: RegisterDeviceTokenDto): Promise<{
        success: boolean;
    }>;
    getNotifications(req: any, query: any): Promise<{
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
    markRead(req: any, id: string): Promise<{
        message: string;
    }>;
    markAllRead(req: any): Promise<{
        message: string;
    }>;
    deleteNotification(req: any, id: string): Promise<{
        message: string;
    }>;
    deleteAllNotifications(req: any): Promise<{
        message: string;
    }>;
    removeDeviceToken(req: any, body: {
        token: string;
    }): Promise<{
        success: boolean;
    }>;
}
