import type { Request } from 'express';
import { WalletsService } from './wallets.service';
declare class SendFundsDto {
    recipient_identifier: string;
    amount: number;
    pin?: string;
    biometric_auth?: boolean;
    device_fingerprint?: string;
    description?: string;
}
export declare class WalletsController {
    private readonly svc;
    constructor(svc: WalletsService);
    getWallet(u: any): Promise<{
        data: {
            id: string;
            wallet_address: string;
            wallet_type: import("@prisma/client").$Enums.wallet_type | null;
            balance: number;
            locked_balance: number;
            available_balance: number;
            currency: string | null;
            blockchain_address: string | null;
            is_frozen: boolean | null;
        };
    }>;
    send(u: any, dto: SendFundsDto, req: Request): Promise<{
        data: {
            transaction_reference: string;
            amount: number;
            fee: number;
            status: string;
        };
        message: string;
    }>;
    transactions(u: any, q: any): Promise<{
        data: {
            amount: number;
            fee: number;
            net_amount: number;
            is_outgoing: boolean;
            sender_username: any;
            recipient_username: any;
            sender_user: {
                id: any;
                username: any;
                first_name: any;
                last_name: any;
                profile_image: any;
            } | null;
            recipient_user: {
                id: any;
                username: any;
                first_name: any;
                last_name: any;
                profile_image: any;
            } | null;
            users_sender: {
                id: any;
                username: any;
                first_name: any;
                last_name: any;
                profile_image: any;
            } | null;
            users_recipient: {
                id: any;
                username: any;
                first_name: any;
                last_name: any;
                profile_image: any;
            } | null;
            wallets_transactions_receiver_wallet_idTowallets: {
                id: string;
                users: {
                    id: string;
                    username: string;
                    first_name: string;
                    last_name: string;
                    profile_image: string | null;
                } | null;
                user_id: string | null;
            } | null;
            wallets_transactions_sender_wallet_idTowallets: {
                id: string;
                users: {
                    id: string;
                    username: string;
                    first_name: string;
                    last_name: string;
                    profile_image: string | null;
                } | null;
                user_id: string | null;
            } | null;
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
            exchange_rate: import("@prisma/client/runtime/library").Decimal | null;
            device_info: string | null;
            blockchain_tx_hash: string | null;
            processed_at: Date | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
}
export {};
