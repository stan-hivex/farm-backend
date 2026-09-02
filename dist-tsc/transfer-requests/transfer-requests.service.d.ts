import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client';
export declare class TransferRequestsService {
    private prisma;
    private authService;
    private notificationsService;
    private securityService;
    private readonly logger;
    constructor(prisma: PrismaService, authService: AuthService, notificationsService: NotificationsService, securityService: SecurityService);
    requestFunds(requesterUserId: string, dto: {
        sender_identifier: string;
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
            users_sender: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.transfer_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            sender_wallet_id: string | null;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            sender_user_id: string | null;
        })[];
        pagination: {
            total: number;
            page: any;
            limit: any;
        };
    }>;
    acceptAndTransfer(senderUserId: string, dto: {
        request_id: string;
        pin?: string;
        biometric_auth?: boolean;
        device_fingerprint?: string;
    }, ip: string): Promise<{
        data: {
            transaction_reference: string;
            amount: Prisma.Decimal;
            fee: Prisma.Decimal;
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
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
    processExpiredRequests(): Promise<number>;
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
            users_sender: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.transfer_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            sender_wallet_id: string | null;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            sender_user_id: string | null;
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
            users_sender: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.transfer_request_status | null;
            expires_at: Date | null;
            ip_address: string | null;
            description: string | null;
            currency: string | null;
            amount: Prisma.Decimal;
            sender_wallet_id: string | null;
            transaction_id: string | null;
            request_reference: string;
            accepted_at: Date | null;
            completed_at: Date | null;
            rejected_at: Date | null;
            requester_user_id: string | null;
            requester_wallet_id: string | null;
            sender_user_id: string | null;
        })[];
        pagination: {
            total: number;
            page: any;
            limit: any;
        };
    }>;
}
