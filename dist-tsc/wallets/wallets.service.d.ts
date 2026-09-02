import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class WalletsService {
    private prisma;
    private authService;
    private securityService;
    private notificationsService;
    private readonly logger;
    constructor(prisma: PrismaService, authService: AuthService, securityService: SecurityService, notificationsService: NotificationsService);
    getMyWallet(userId: string): Promise<{
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
    sendFunds(senderId: string, dto: {
        recipient_identifier: string;
        amount: number;
        pin?: string;
        description?: string;
        biometric_auth?: boolean;
        device_fingerprint?: string;
    }, ip: string): Promise<{
        data: {
            transaction_reference: string;
            amount: number;
            fee: number;
            status: string;
        };
        message: string;
    }>;
    getTransactions(userId: string, query: any): Promise<{
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
    private buildUserSummary;
}
