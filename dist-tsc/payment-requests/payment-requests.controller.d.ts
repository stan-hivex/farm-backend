import type { Request } from 'express';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { AcceptPaymentRequestDto } from './dto/accept-payment-request.dto';
import { AcceptPaymentRequestsBatchDto } from './dto/accept-payment-requests-batch.dto';
import { PaymentRequestsService } from './payment-requests.service';
export declare class PaymentRequestsController {
    private readonly svc;
    constructor(svc: PaymentRequestsService);
    requestPayment(u: any, dto: CreatePaymentRequestDto, req: Request): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
    acceptAndTransfer(u: any, dto: AcceptPaymentRequestDto, req: Request): Promise<{
        data: {
            transaction_reference: string;
            amount: any;
            fee: import("@prisma/client/runtime/library").Decimal;
            status: string;
            request_reference: any;
        };
        message: string;
    }>;
    acceptAndTransferBatch(u: any, dto: AcceptPaymentRequestsBatchDto, req: Request): Promise<{
        data: {
            request_ids: string[];
            transactions: any[];
            status: string;
        };
        message: string;
    }>;
    approveRequest(u: any, dto: AcceptPaymentRequestDto, req: Request): Promise<{
        data: {
            transaction_reference: string;
            amount: any;
            fee: import("@prisma/client/runtime/library").Decimal;
            status: string;
            request_reference: any;
        };
        message: string;
    }>;
    declineRequest(u: any, id: string): Promise<{
        data: {
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
    getMyRequestHistory(u: any, q: any): Promise<{
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
            amount: import("@prisma/client/runtime/library").Decimal;
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
