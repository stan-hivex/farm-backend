import { AdminService } from './admin.service';
import { WithdrawService } from '../withdraw/withdraw.service';
declare class UserStatusDto {
    is_active?: boolean;
    is_suspended?: boolean;
}
declare class ResolveDto {
    winner: 'buyer' | 'seller';
    note: string;
}
declare class MerchantDecisionDto {
    status: 'approved' | 'rejected';
    rejection_reason?: string;
}
declare class SettingDto {
    value: string;
}
declare class ExchangeRateDto {
    base_currency: string;
    target_currency: string;
    rate: number;
}
declare class ExchangeRatesDto {
    rates: ExchangeRateDto[];
}
declare class CurrencyRateDto {
    usd_kes_rate: number;
}
declare class CreateSuperadminDto {
    first_name: string;
    last_name: string;
    username: string;
    phone: string;
    email: string;
    password: string;
    country: string;
}
declare class UpdateUserDto {
    first_name?: string;
    last_name?: string;
    username?: string;
    phone?: string;
    email?: string;
    country?: string;
    role?: string;
    is_active?: boolean;
    is_suspended?: boolean;
}
declare class SendNotificationDto {
    user_id: string;
    title: string;
    body: string;
    type?: string;
    metadata?: any;
    push?: boolean;
    email?: boolean;
    sms?: boolean;
}
declare class BroadcastNotificationDto {
    title: string;
    body: string;
    type?: string;
    metadata?: any;
    push?: boolean;
    email?: boolean;
    sms?: boolean;
    audience?: string;
    target_role?: string;
    recipientIds?: string[];
    recipientEmails?: string[];
    recipientPhones?: string[];
}
export declare class AdminController {
    private readonly svc;
    private readonly withdrawService;
    constructor(svc: AdminService, withdrawService: WithdrawService);
    stats(): Promise<{
        data: {
            total_users: number;
            total_merchants: number;
            active_escrows: number;
            total_tx_volume: number;
            total_transactions: number;
            pending_kyc: number;
            pending_payouts: number;
        };
    }>;
    transactions(q: any): Promise<{
        data: {
            id: string;
            transaction_reference: string;
            transaction_type: import("@prisma/client").$Enums.transaction_type;
            status: import("@prisma/client").$Enums.transaction_status | null;
            amount: number;
            fee: number;
            net_amount: number;
            currency: string | null;
            description: string | null;
            created_at: Date | null;
            processed_at: Date | null;
            sender_wallet: string | undefined;
            receiver_wallet: string | undefined;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    users(q: any): Promise<{
        data: {
            balance: number;
            id: string;
            username: string;
            email: string | null;
            phone: string;
            first_name: string;
            last_name: string;
            role: import("@prisma/client").$Enums.user_role | null;
            kyc_status: import("@prisma/client").$Enums.kyc_status | null;
            is_active: boolean | null;
            is_suspended: boolean | null;
            created_at: Date | null;
            wallets: {
                balance: import("@prisma/client/runtime/library").Decimal | null;
            }[];
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    user(id: string): Promise<{
        data: {
            kyc_documents_kyc_documents_user_idTousers: {
                id: string;
                email: string | null;
                phone: string | null;
                first_name: string | null;
                last_name: string | null;
                country: string | null;
                city: string | null;
                created_at: Date | null;
                status: import("@prisma/client").$Enums.kyc_status | null;
                user_id: string | null;
                document_type: string | null;
                front_image: string | null;
                back_image: string | null;
                selfie_image: string | null;
                document_number: string | null;
                reviewed_by: string | null;
                rejection_reason: string | null;
                reviewed_at: Date | null;
                address_document: string | null;
                back_image_url: string | null;
                county: string | null;
                date_of_birth: Date | null;
                front_image_url: string | null;
                gender: string | null;
                nationality: string | null;
                physical_address: string | null;
                postal_code: string | null;
                selfie_image_url: string | null;
            }[];
            merchants_merchants_user_idTousers: {
                id: string;
                country: string | null;
                city: string | null;
                address: string | null;
                created_at: Date | null;
                updated_at: Date | null;
                status: import("@prisma/client").$Enums.merchant_status | null;
                user_id: string | null;
                business_name: string;
                business_email: string | null;
                business_phone: string | null;
                business_type: string | null;
                business_registration_number: string | null;
                business_logo: string | null;
                qr_code: string | null;
                qr_secret: string | null;
                daily_limit: import("@prisma/client/runtime/library").Decimal | null;
                transaction_fee_percent: import("@prisma/client/runtime/library").Decimal | null;
                total_sales: import("@prisma/client/runtime/library").Decimal | null;
                approved_by: string | null;
                approved_at: Date | null;
            }[];
            wallets: {
                id: string;
                is_active: boolean | null;
                created_at: Date | null;
                updated_at: Date | null;
                user_id: string | null;
                wallet_name: string | null;
                wallet_type: import("@prisma/client").$Enums.wallet_type | null;
                wallet_address: string;
                balance: import("@prisma/client/runtime/library").Decimal | null;
                locked_balance: import("@prisma/client/runtime/library").Decimal | null;
                currency: string | null;
                blockchain_address: string | null;
                is_frozen: boolean | null;
            }[];
        } & {
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
        };
    }>;
    userStatus(id: string, dto: UserStatusDto, u: any): Promise<{
        data: {
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
        };
        message: string;
    }>;
    updateUser(id: string, dto: UpdateUserDto, u: any): Promise<{
        data: {
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
        };
        message: string;
    }>;
    deleteUser(id: string, u: any): Promise<{
        data: {
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
        };
        message: string;
    }>;
    escrows(q: any): Promise<{
        data: {
            amount: number;
            fee: number;
            users_escrow_contracts_buyer_idTousers: {
                username: string;
            } | null;
            users_escrow_contracts_seller_idTousers: {
                username: string;
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
    escrowDetail(id: string): Promise<{
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
            } | null;
            users_escrow_contracts_seller_idTousers: {
                id: string;
                username: string;
                email: string | null;
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
    resolve(id: string, u: any, dto: ResolveDto): Promise<{
        message: string;
    }>;
    merchants(q: any): Promise<{
        data: ({
            users_merchants_user_idTousers: {
                username: string;
                email: string | null;
                phone: string;
            } | null;
        } & {
            id: string;
            country: string | null;
            city: string | null;
            address: string | null;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.merchant_status | null;
            user_id: string | null;
            business_name: string;
            business_email: string | null;
            business_phone: string | null;
            business_type: string | null;
            business_registration_number: string | null;
            business_logo: string | null;
            qr_code: string | null;
            qr_secret: string | null;
            daily_limit: import("@prisma/client/runtime/library").Decimal | null;
            transaction_fee_percent: import("@prisma/client/runtime/library").Decimal | null;
            total_sales: import("@prisma/client/runtime/library").Decimal | null;
            approved_by: string | null;
            approved_at: Date | null;
        })[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    merchant(id: string): Promise<{
        data: {
            total_sales: number;
            daily_limit: number;
            transaction_fee_percent: number;
            merchant_payouts: {
                id: string;
                created_at: Date | null;
                status: import("@prisma/client").$Enums.transaction_status | null;
                amount: import("@prisma/client/runtime/library").Decimal | null;
                processed_at: Date | null;
                merchant_id: string | null;
                payout_method: string | null;
                account_name: string | null;
                account_number: string | null;
                processed_by: string | null;
            }[];
            users_merchants_user_idTousers: {
                id: string;
                username: string;
                email: string | null;
                phone: string;
                first_name: string;
                last_name: string;
            } | null;
            id: string;
            country: string | null;
            city: string | null;
            address: string | null;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.merchant_status | null;
            user_id: string | null;
            business_name: string;
            business_email: string | null;
            business_phone: string | null;
            business_type: string | null;
            business_registration_number: string | null;
            business_logo: string | null;
            qr_code: string | null;
            qr_secret: string | null;
            approved_by: string | null;
            approved_at: Date | null;
        };
    }>;
    decision(id: string, u: any, dto: MerchantDecisionDto): Promise<{
        data: {
            id: string;
            country: string | null;
            city: string | null;
            address: string | null;
            created_at: Date | null;
            updated_at: Date | null;
            status: import("@prisma/client").$Enums.merchant_status | null;
            user_id: string | null;
            business_name: string;
            business_email: string | null;
            business_phone: string | null;
            business_type: string | null;
            business_registration_number: string | null;
            business_logo: string | null;
            qr_code: string | null;
            qr_secret: string | null;
            daily_limit: import("@prisma/client/runtime/library").Decimal | null;
            transaction_fee_percent: import("@prisma/client/runtime/library").Decimal | null;
            total_sales: import("@prisma/client/runtime/library").Decimal | null;
            approved_by: string | null;
            approved_at: Date | null;
        };
        message: string;
    }>;
    payouts(q: any): Promise<{
        data: {
            amount: number;
            merchants: {
                business_name: string;
            } | null;
            id: string;
            created_at: Date | null;
            status: import("@prisma/client").$Enums.transaction_status | null;
            processed_at: Date | null;
            merchant_id: string | null;
            payout_method: string | null;
            account_name: string | null;
            account_number: string | null;
            processed_by: string | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    fees(): Promise<{
        data: {
            flat_fee: number;
            percentage_fee: number;
            minimum_fee: number;
            maximum_fee: number;
            value: string;
            id: string;
            is_active: boolean | null;
            created_at: Date | null;
            transaction_type: string | null;
        }[];
    }>;
    updateFee(id: string, dto: {
        value: string;
    }, u: any): Promise<{
        data: {
            flat_fee: number;
            percentage_fee: number;
            minimum_fee: number;
            maximum_fee: number;
            id: string;
            is_active: boolean | null;
            created_at: Date | null;
            transaction_type: string | null;
        };
        message: string;
    }>;
    processPayout(id: string, u: any): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            status: import("@prisma/client").$Enums.transaction_status | null;
            amount: import("@prisma/client/runtime/library").Decimal | null;
            processed_at: Date | null;
            merchant_id: string | null;
            payout_method: string | null;
            account_name: string | null;
            account_number: string | null;
            processed_by: string | null;
        };
        message: string;
    }>;
    sendNotification(u: any, dto: SendNotificationDto): Promise<{
        message: string;
    }>;
    broadcastNotification(u: any, dto: BroadcastNotificationDto): Promise<{
        message: string;
    }>;
    kycQueue(q: any): Promise<{
        data: {
            id: string;
            user_id: string | null;
            username: string | undefined;
            email: string | null | undefined;
            phone: string | undefined;
            first_name: string | null;
            last_name: string | null;
            document_type: string | null;
            document_number: string | null;
            status: import("@prisma/client").$Enums.kyc_status | null;
            created_at: Date | null;
            front_image_url: string | null;
            back_image_url: string | null;
            selfie_image_url: string | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    reviewKyc(id: string, u: any, dto: ResolveDto): Promise<{
        data: {
            id: string;
            email: string | null;
            phone: string | null;
            first_name: string | null;
            last_name: string | null;
            country: string | null;
            city: string | null;
            created_at: Date | null;
            status: import("@prisma/client").$Enums.kyc_status | null;
            user_id: string | null;
            document_type: string | null;
            front_image: string | null;
            back_image: string | null;
            selfie_image: string | null;
            document_number: string | null;
            reviewed_by: string | null;
            rejection_reason: string | null;
            reviewed_at: Date | null;
            address_document: string | null;
            back_image_url: string | null;
            county: string | null;
            date_of_birth: Date | null;
            front_image_url: string | null;
            gender: string | null;
            nationality: string | null;
            physical_address: string | null;
            postal_code: string | null;
            selfie_image_url: string | null;
        };
        message: string;
    }>;
    analytics(): Promise<{
        data: {
            total_users: number;
            total_escrows: number;
            total_transactions: number;
            pending_kyc: number;
            pending_payouts: number;
            security_events: number;
            recent_transactions: {
                amount: number;
                net_amount: number;
                id: string;
                created_at: Date | null;
                status: import("@prisma/client").$Enums.transaction_status | null;
                transaction_type: import("@prisma/client").$Enums.transaction_type;
                transaction_reference: string;
            }[];
        };
    }>;
    settings(): Promise<{
        data: {
            id: string;
            updated_at: Date | null;
            description: string | null;
            updated_by: string | null;
            setting_key: string | null;
            setting_value: string | null;
        }[];
    }>;
    updateSetting(key: string, dto: SettingDto, u: any): Promise<{
        data: {
            id: string;
            updated_at: Date | null;
            description: string | null;
            updated_by: string | null;
            setting_key: string | null;
            setting_value: string | null;
        };
        message: string;
    }>;
    getExchangeRates(): Promise<{
        data: {
            id: string;
            provider: string | null;
            base_currency: string | null;
            target_currency: string | null;
            rate: import("@prisma/client/runtime/library").Decimal | null;
            fetched_at: Date | null;
        }[];
    }>;
    updateExchangeRates(dto: ExchangeRatesDto, u: any): Promise<{
        data: any[];
        message: string;
    }>;
    getCurrencyRates(): Promise<{
        data: {
            id: string;
            is_active: boolean;
            created_at: Date | null;
            updated_at: Date | null;
            usd_kes_rate: import("@prisma/client/runtime/library").Decimal;
            farm_kes_rate: import("@prisma/client/runtime/library").Decimal;
            effective_at: Date;
            updated_by: string | null;
        }[];
    }>;
    updateCurrencyRate(dto: CurrencyRateDto, u: any): Promise<{
        data: any;
        message: string;
    }>;
    auditLogs(q: any): Promise<{
        data: ({
            users: {
                username: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            ip_address: string | null;
            user_agent: string | null;
            action: string | null;
            entity_type: string | null;
            entity_id: string | null;
            old_values: import("@prisma/client/runtime/library").JsonValue | null;
            new_values: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    createProject(u: any, dto: any): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: string | null;
            description: string | null;
            project_name: string;
            category: string | null;
            banner_image: string | null;
            target_amount: import("@prisma/client/runtime/library").Decimal | null;
            raised_amount: import("@prisma/client/runtime/library").Decimal | null;
            minimum_investment: import("@prisma/client/runtime/library").Decimal | null;
            roi_percent: import("@prisma/client/runtime/library").Decimal | null;
            duration_months: number | null;
            total_backers: number | null;
            starts_at: Date | null;
            ends_at: Date | null;
            created_by: string | null;
        };
        message: string;
    }>;
    updateProject(id: string, dto: any): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: string | null;
            description: string | null;
            project_name: string;
            category: string | null;
            banner_image: string | null;
            target_amount: import("@prisma/client/runtime/library").Decimal | null;
            raised_amount: import("@prisma/client/runtime/library").Decimal | null;
            minimum_investment: import("@prisma/client/runtime/library").Decimal | null;
            roi_percent: import("@prisma/client/runtime/library").Decimal | null;
            duration_months: number | null;
            total_backers: number | null;
            starts_at: Date | null;
            ends_at: Date | null;
            created_by: string | null;
        };
    }>;
    auditDashboard(): Promise<{
        data: {
            recent_security_events: ({
                users: {
                    username: string;
                    email: string | null;
                } | null;
            } & {
                id: string;
                created_at: Date | null;
                user_id: string | null;
                ip_address: string | null;
                event_type: string | null;
                description: string | null;
                severity: string | null;
            })[];
            recent_activities: ({
                users: {
                    username: string;
                    phone: string;
                } | null;
            } & {
                id: string;
                created_at: Date | null;
                user_id: string | null;
                ip_address: string | null;
                activity: string | null;
                metadata: import("@prisma/client/runtime/library").JsonValue | null;
            })[];
            active_sessions: {
                id: string;
                created_at: Date | null;
                expires_at: Date | null;
                user_id: string | null;
                refresh_token: string;
                jwt_id: string | null;
                device_name: string | null;
                device_os: string | null;
                ip_address: string | null;
                user_agent: string | null;
                is_revoked: boolean | null;
                used_at: Date | null;
            }[];
            recent_audit_logs: ({
                users: {
                    username: string;
                } | null;
            } & {
                id: string;
                created_at: Date | null;
                user_id: string | null;
                ip_address: string | null;
                user_agent: string | null;
                action: string | null;
                entity_type: string | null;
                entity_id: string | null;
                old_values: import("@prisma/client/runtime/library").JsonValue | null;
                new_values: import("@prisma/client/runtime/library").JsonValue | null;
            })[];
            security_event_summary: (import("@prisma/client").Prisma.PickEnumerable<import("@prisma/client").Prisma.Security_eventsGroupByOutputType, "event_type"[]> & {
                _count: number;
            })[];
        };
    }>;
    securityEvents(q: any): Promise<{
        data: ({
            users: {
                username: string;
                email: string | null;
                phone: string;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            ip_address: string | null;
            event_type: string | null;
            description: string | null;
            severity: string | null;
        })[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    securityStats(): Promise<{
        data: {
            total_security_events: number;
            critical_events: number;
            high_severity_events: number;
            failed_login_attempts: number;
            token_theft_detections: number;
            suspended_accounts: number;
        };
    }>;
    userActivity(id: string, q: any): Promise<{
        data: ({
            users: {
                username: string;
                email: string | null;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            ip_address: string | null;
            activity: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    userSessions(id: string, q: any): Promise<{
        data: {
            id: string;
            device_name: string | null;
            device_os: string | null;
            ip_address: string | null;
            user_agent: string | null;
            is_revoked: boolean | null;
            used_at: Date | null;
            created_at: Date | null;
            expires_at: Date | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    adminLogs(q: any): Promise<{
        data: ({
            users: {
                username: string;
                email: string | null;
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            ip_address: string | null;
            user_agent: string | null;
            action: string | null;
            entity_type: string | null;
            entity_id: string | null;
            old_values: import("@prisma/client/runtime/library").JsonValue | null;
            new_values: import("@prisma/client/runtime/library").JsonValue | null;
        })[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    complianceReport(q: any): Promise<{
        data: {
            period: {
                start_date: Date;
                end_date: Date;
            };
            kyc_status: {
                verified: number;
                pending: number;
                rejected: number;
            };
            transactions: {
                completed: number;
                failed: number;
            };
            suspicious_activities: number;
        };
    }>;
    allWithdrawals(q: any): Promise<{
        data: {
            amount: number;
            id: string;
            status: string;
            currency: string;
            userId: string;
            total: number;
            fee: number;
            reference: string;
            createdAt: Date;
            updatedAt: Date;
            method: string;
            settlement: number;
            accountName: string | null;
            accountNumber: string | null;
            bankName: string | null;
            phoneNumber: string | null;
            cryptoAddress: string | null;
            cryptoAsset: string | null;
            network: string | null;
            rejectionReason: string | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    processWithdrawal(id: string, u: any): Promise<{
        message: string;
    }>;
    getSuperadminWallet(u: any): Promise<{
        data: {
            balance: number;
            available_balance: number;
            locked_balance: number;
            pending_withdrawals: number;
            total_withdrawn: number;
            currency: string;
            wallet_address: string;
        };
    }>;
    withdrawSuperadminFunds(u: any, dto: any): Promise<{
        success: boolean;
        reference: string;
        withdrawal: {
            id: string;
            status: string;
            currency: string;
            userId: string;
            amount: number;
            total: number;
            fee: number;
            reference: string;
            createdAt: Date;
            updatedAt: Date;
            method: string;
            settlement: number;
            accountName: string | null;
            accountNumber: string | null;
            bankName: string | null;
            phoneNumber: string | null;
            cryptoAddress: string | null;
            cryptoAsset: string | null;
            network: string | null;
            rejectionReason: string | null;
        };
    }>;
    createSuperadmin(dto: CreateSuperadminDto, u: any): Promise<{
        data: {
            id: any;
            first_name: any;
            last_name: any;
            username: any;
            phone: any;
            email: any;
            role: any;
        };
        message: string;
    }>;
    listSuperadmins(q: any): Promise<{
        data: {
            id: string;
            username: string;
            email: string | null;
            phone: string;
            first_name: string;
            last_name: string;
            role: import("@prisma/client").$Enums.user_role | null;
            is_active: boolean | null;
            created_at: Date | null;
            updated_at: Date | null;
        }[];
        total: number;
        page: any;
        limit: any;
    }>;
    getSuperadmin(id: string): Promise<{
        data: {
            id: string;
            username: string;
            email: string | null;
            phone: string;
            first_name: string;
            last_name: string;
            role: import("@prisma/client").$Enums.user_role | null;
            is_active: boolean | null;
            phone_verified: boolean | null;
            email_verified: boolean | null;
            country: string | null;
            created_at: Date | null;
            updated_at: Date | null;
        };
    }>;
    updateSuperadmin(id: string, dto: any, u: any): Promise<{
        data: {
            id: string;
            username: string;
            email: string | null;
            phone: string;
            first_name: string;
            last_name: string;
            role: import("@prisma/client").$Enums.user_role | null;
            is_active: boolean | null;
        };
        message: string;
    }>;
    deactivateSuperadmin(id: string, u: any): Promise<{
        data: {
            id: string;
            username: string;
            first_name: string;
            last_name: string;
            role: import("@prisma/client").$Enums.user_role | null;
            is_active: boolean | null;
        };
        message: string;
    }>;
}
export declare class SuperadminController {
    private readonly svc;
    constructor(svc: AdminService);
    superadminDashboard(): Promise<{
        data: {
            total_users: number;
            total_revenue: number;
            active_transactions: number;
            flagged_transactions: number;
            support_tickets: number;
            pending_disputes: number;
            pending_kyc: number;
            system_health: number;
            recent_activities: {
                description: string;
                type: any;
                timestamp: any;
            }[];
            escrow_total_earnings: number;
            withdrawal_total_earnings: number;
            platform_fee_total_earnings: number;
            escrow_creation_earnings: number;
            escrow_release_earnings: number;
            total_escrow_count: number;
        };
    }>;
    getCurrentCurrencyRate(): Promise<{
        data: any;
    }>;
}
export {};
