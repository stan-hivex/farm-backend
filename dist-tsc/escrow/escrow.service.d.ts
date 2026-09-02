import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class EscrowService {
    private prisma;
    private authService;
    private paystack;
    private notificationsService;
    private securityService;
    private readonly logger;
    constructor(prisma: PrismaService, authService: AuthService, paystack: PaystackService, notificationsService: NotificationsService, securityService: SecurityService);
    private getSuperadminWallet;
    private getSuperadminWalletInTx;
    private creditSuperadminWalletInTx;
    create(buyerId: string, dto: {
        seller_identifier: string;
        amount: number;
        title: string;
        description?: string;
        auto_release_days?: number;
        pin?: string;
        biometric_auth?: boolean;
        device_fingerprint?: string;
    }): Promise<{
        data: {
            amount: number;
            fee: number;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.escrow_status | null;
            description: string | null;
            title: string | null;
            reference_code: string;
            buyer_id: string | null;
            seller_id: string | null;
            arbiter_id: string | null;
            buyer_wallet_id: string | null;
            seller_wallet_id: string | null;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            funded_at: Date | null;
            released_at: Date | null;
            disputed_at: Date | null;
            resolved_at: Date | null;
            auto_release_at: Date | null;
            resolution_note: string | null;
        };
        message: string;
    }>;
    release(escrowId: string, buyerId: string, dto?: {
        pin?: string;
        biometric_auth?: boolean;
        device_fingerprint?: string;
    }): Promise<{
        message: string;
    }>;
    dispute(escrowId: string, userId: string, dto: {
        reason: string;
    }): Promise<{
        message: string;
    }>;
    cancel(escrowId: string, userId: string): Promise<{
        message: string;
    }>;
    addMessage(escrowId: string, senderId: string, message: string): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            message: string | null;
            escrow_id: string | null;
            sender_id: string | null;
            attachment_url: string | null;
        };
    }>;
    list(userId: string, query: any): Promise<{
        data: {
            amount: number;
            fee: number;
            escrow_messages: {
                id: string;
                created_at: Date | null;
                message: string | null;
                escrow_id: string | null;
                sender_id: string | null;
                attachment_url: string | null;
            }[];
            users_escrow_contracts_buyer_idTousers: {
                id: string;
                username: string;
                email: string | null;
                firebase_uid: string | null;
                phone: string;
                first_name: string;
                last_name: string;
                password_hash: string;
                pin_hash: string | null;
                role: import("@prisma/client").$Enums.user_role | null;
                kyc_status: import("@prisma/client").$Enums.kyc_status | null;
                is_active: boolean | null;
                is_suspended: boolean | null;
                is_deleted: boolean | null;
                phone_verified: boolean | null;
                email_verified: boolean | null;
                failed_login_attempts: number | null;
                failed_pin_attempts: number | null;
                profile_image: string | null;
                bio: string | null;
                country: string | null;
                city: string | null;
                address: string | null;
                referral_code: string | null;
                referred_by: string | null;
                last_login_at: Date | null;
                last_seen_at: Date | null;
                created_at: Date | null;
                updated_at: Date | null;
                deleted_at: Date | null;
                kyc_level: number | null;
            } | null;
            users_escrow_contracts_seller_idTousers: {
                id: string;
                username: string;
                email: string | null;
                firebase_uid: string | null;
                phone: string;
                first_name: string;
                last_name: string;
                password_hash: string;
                pin_hash: string | null;
                role: import("@prisma/client").$Enums.user_role | null;
                kyc_status: import("@prisma/client").$Enums.kyc_status | null;
                is_active: boolean | null;
                is_suspended: boolean | null;
                is_deleted: boolean | null;
                phone_verified: boolean | null;
                email_verified: boolean | null;
                failed_login_attempts: number | null;
                failed_pin_attempts: number | null;
                profile_image: string | null;
                bio: string | null;
                country: string | null;
                city: string | null;
                address: string | null;
                referral_code: string | null;
                referred_by: string | null;
                last_login_at: Date | null;
                last_seen_at: Date | null;
                created_at: Date | null;
                updated_at: Date | null;
                deleted_at: Date | null;
                kyc_level: number | null;
            } | null;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.escrow_status | null;
            description: string | null;
            title: string | null;
            reference_code: string;
            buyer_id: string | null;
            seller_id: string | null;
            arbiter_id: string | null;
            buyer_wallet_id: string | null;
            seller_wallet_id: string | null;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            funded_at: Date | null;
            released_at: Date | null;
            disputed_at: Date | null;
            resolved_at: Date | null;
            auto_release_at: Date | null;
            resolution_note: string | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    getOne(escrowId: string, userId: string): Promise<{
        data: {
            amount: number;
            fee: number;
            escrow_messages: {
                id: string;
                created_at: Date | null;
                message: string | null;
                escrow_id: string | null;
                sender_id: string | null;
                attachment_url: string | null;
            }[];
            users_escrow_contracts_buyer_idTousers: {
                username: string;
                first_name: string;
            } | null;
            users_escrow_contracts_seller_idTousers: {
                username: string;
                first_name: string;
            } | null;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.escrow_status | null;
            description: string | null;
            title: string | null;
            reference_code: string;
            buyer_id: string | null;
            seller_id: string | null;
            arbiter_id: string | null;
            buyer_wallet_id: string | null;
            seller_wallet_id: string | null;
            evidence: import("@prisma/client/runtime/library").JsonValue | null;
            funded_at: Date | null;
            released_at: Date | null;
            disputed_at: Date | null;
            resolved_at: Date | null;
            auto_release_at: Date | null;
            resolution_note: string | null;
        };
    }>;
    processAutoReleases(): Promise<number>;
    executeRelease(escrow: any): Promise<void>;
    executeRefund(escrow: any): Promise<void>;
    private getEscrowOrFail;
}
