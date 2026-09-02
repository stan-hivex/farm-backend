import { EscrowService } from './escrow.service';
declare class EscrowAuthDto {
    pin?: string;
    biometric_auth?: boolean;
    device_fingerprint?: string;
}
declare class CreateEscrowDto extends EscrowAuthDto {
    seller_identifier: string;
    amount: number;
    title: string;
    description?: string;
    auto_release_days?: number;
}
declare class DisputeDto {
    reason: string;
}
declare class MessageDto {
    message: string;
}
export declare class EscrowController {
    private readonly svc;
    constructor(svc: EscrowService);
    list(u: any, q: any): Promise<{
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
    create(u: any, dto: CreateEscrowDto): Promise<{
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
    getOne(u: any, id: string): Promise<{
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
    release(u: any, id: string, dto: EscrowAuthDto): Promise<{
        message: string;
    }>;
    dispute(u: any, id: string, dto: DisputeDto): Promise<{
        message: string;
    }>;
    cancel(u: any, id: string): Promise<{
        message: string;
    }>;
    message(u: any, id: string, dto: MessageDto): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            message: string | null;
            escrow_id: string | null;
            sender_id: string | null;
            attachment_url: string | null;
        };
    }>;
}
export {};
