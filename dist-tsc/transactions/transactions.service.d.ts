import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
export interface TransactionUserSummary {
    id: string;
    username: string;
    first_name?: string | null;
    last_name?: string | null;
    profile_image?: string | null;
}
export declare class TransactionsService {
    private prisma;
    private cache;
    constructor(prisma: PrismaService, cache: CacheService);
    findAll(userId: string, query: any): Promise<any>;
    findOne(userId: string, txId: string): Promise<{
        data: {
            status: string;
            description: string;
            amount: number;
            fee: number;
            net_amount: number;
            is_outgoing: boolean;
            sender_username: string;
            recipient_username: string;
            sender_user: TransactionUserSummary | null;
            recipient_user: TransactionUserSummary | null;
            users_sender: TransactionUserSummary | null;
            users_recipient: TransactionUserSummary | null;
            merchant_business_name: string;
            ledger_entries: {
                id: string;
                created_at: Date | null;
                description: string | null;
                amount: import("@prisma/client/runtime/library").Decimal;
                transaction_id: string | null;
                entry_type: string;
                balance_before: import("@prisma/client/runtime/library").Decimal | null;
                balance_after: import("@prisma/client/runtime/library").Decimal | null;
                wallet_id: string | null;
            }[];
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
            ip_address: string | null;
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
        };
    }>;
    private buildUserSummary;
    private normalizeTransactionStatus;
    private normalizeTransactionDescription;
}
