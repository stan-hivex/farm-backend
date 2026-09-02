import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client';
export declare class PaymentRequestsService {
    private prisma;
    private authService;
    private notificationsService;
    private readonly logger;
    constructor(prisma: PrismaService, authService: AuthService, notificationsService: NotificationsService);
    createRequest(requesterUserId: string, dto: {
        recipient_identifier: string;
        amount: number;
        description?: string;
    }, ip: string): Promise<{
        data: {
            request_id: string;
            request_reference: string;
            status: string;
            amount: number;
            expires_at: Date;
        };
        message: string;
    }>;
    getPendingRequests(userId: string, query: any): Promise<{
        data: ({
            users_requester: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
                profile_image: string | null;
            } | null;
            users_recipient: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.payment_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            recipient_user_id: string | null;
            recipient_wallet_id: string | null;
        })[];
        pagination: {
            total: number;
            page: any;
            limit: any;
        };
    }>;
    processExpiredRequests(): Promise<number>;
    acceptAndTransfer(senderUserId: string, dto: {
        request_id: string;
        pin?: string;
        biometric_auth?: boolean;
    }, ip: string): Promise<{
        data: {
            transaction_reference: string;
            amount: any;
            fee: Prisma.Decimal;
            status: string;
            request_reference: any;
        };
        message: string;
    }>;
    acceptAndTransferBatch(senderUserId: string, dto: {
        request_ids: string[];
        pin?: string;
        biometric_auth?: boolean;
    }, ip: string): Promise<{
        data: {
            request_ids: string[];
            transactions: any[];
            status: string;
        };
        message: string;
    }>;
    private verifyTransactionAuthorization;
    private transferRequestInTransaction;
    private notifyCompletedTransfer;
    rejectRequest(senderUserId: string, requestId: string): Promise<{
        data: {
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
    cancelRequest(requesterUserId: string, requestId: string): Promise<{
        data: {
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
    getRequestDetails(userId: string, requestId: string): Promise<{
        data: {
            transactions: {
                status: import("@prisma/client").$Enums.transaction_status | null;
                transaction_reference: string;
            } | null;
            users_requester: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
                profile_image: string | null;
            } | null;
            users_recipient: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.payment_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            recipient_user_id: string | null;
            recipient_wallet_id: string | null;
        };
    }>;
    getMyRequestHistory(userId: string, query: any): Promise<{
        data: ({
            users_requester: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
                profile_image: string | null;
            } | null;
            users_recipient: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.payment_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            recipient_user_id: string | null;
            recipient_wallet_id: string | null;
        })[];
        pagination: {
            total: number;
            page: any;
            limit: any;
        };
    }>;
}
