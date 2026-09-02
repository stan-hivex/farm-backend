import type { Request } from 'express';
import { TransferRequestsService } from './transfer-requests.service';
declare class RequestFundsDto {
    sender_identifier: string;
    amount: number;
    description?: string;
}
declare class AcceptTransferDto {
    request_id: string;
    pin?: string;
    biometric_auth?: boolean;
    device_fingerprint?: string;
}
export declare class TransferRequestsController {
    private readonly svc;
    constructor(svc: TransferRequestsService);
    requestFunds(u: any, dto: RequestFundsDto, req: Request): Promise<{
        data: {
            request_id: string;
            request_reference: string;
            status: string;
            amount: number;
            expires_at: Date;
        };
        message: string;
    }>;
    getPendingRequests(u: any, q: any): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
    acceptAndTransfer(u: any, dto: AcceptTransferDto, req: Request): Promise<{
        data: {
            transaction_reference: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            fee: import("@prisma/client/runtime/library").Decimal;
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
    rejectRequest(u: any, id: string): Promise<{
        data: {
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
    cancelRequest(u: any, id: string): Promise<{
        data: {
            status: string;
            request_reference: string;
        };
        message: string;
    }>;
    getRequestDetails(u: any, id: string): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
    getMyRequestHistory(u: any, q: any): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
export {};
