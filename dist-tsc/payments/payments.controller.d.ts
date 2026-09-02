import type { Request } from 'express';
import { PaymentsService } from './payments.service';
declare class DepositDto {
    amount_fiat: number;
    currency: string;
    paymentMethod?: 'CARD' | 'MOBILE_MONEY' | 'CRYPTO' | 'BANK_TRANSFER';
    phone?: string;
}
export declare class PaymentsController {
    private readonly svc;
    constructor(svc: PaymentsService);
    deposit(u: any, dto: DepositDto, req: Request): Promise<{
        data: {
            provider: string;
            reference: string;
            payment_url: any;
            authorization_url: any;
            payment_link?: undefined;
            checkout_url?: undefined;
        };
        message: string;
    } | {
        data: {
            provider: string;
            reference: string;
            payment_link: any;
            checkout_url: any;
            payment_url?: undefined;
            authorization_url?: undefined;
        };
        message: string;
    }>;
    deposits(u: any): Promise<{
        data: {
            amount: number;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.transaction_status | null;
            ip_address: string | null;
            description: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            currency: string | null;
            transaction_type: import("@prisma/client").$Enums.transaction_type;
            receiver_wallet_id: string | null;
            sender_wallet_id: string | null;
            transaction_reference: string;
            fee: import("@prisma/client/runtime/library").Decimal | null;
            net_amount: import("@prisma/client/runtime/library").Decimal | null;
            exchange_rate: import("@prisma/client/runtime/library").Decimal | null;
            device_info: string | null;
            blockchain_tx_hash: string | null;
            processed_at: Date | null;
        }[];
    }>;
    withdrawals(u: any): Promise<{
        data: {
            amount: number;
            method: any;
            status: string;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            ip_address: string | null;
            description: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            currency: string | null;
            transaction_type: import("@prisma/client").$Enums.transaction_type;
            receiver_wallet_id: string | null;
            sender_wallet_id: string | null;
            transaction_reference: string;
            fee: import("@prisma/client/runtime/library").Decimal | null;
            net_amount: import("@prisma/client/runtime/library").Decimal | null;
            exchange_rate: import("@prisma/client/runtime/library").Decimal | null;
            device_info: string | null;
            blockchain_tx_hash: string | null;
            processed_at: Date | null;
        }[];
    }>;
}
export {};
