import { MerchantsService } from './merchants.service';
declare class ApplyDto {
    business_name: string;
    business_type?: string;
    business_email?: string;
    business_phone?: string;
    country?: string;
    city?: string;
}
declare class PayoutDto {
    amount: number;
    payout_method: string;
    account_name: string;
    account_number: string;
}
export declare class MerchantsController {
    private readonly svc;
    constructor(svc: MerchantsService);
    apply(u: any, dto: ApplyDto): Promise<{
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
    get(u: any): Promise<{
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
    }>;
    dashboard(u: any): Promise<{
        data: {
            merchant: {
                id: string;
                business_name: string;
                status: import("@prisma/client").$Enums.merchant_status | null;
                qr_code: string | null;
                qr_payload: string;
                qr_image_base64: string;
                qr_image_data_url: string;
                qrImageBase64: string;
                qrImageDataUrl: string;
            };
            stats: {
                sales_today: number;
                sales_today_count: number;
                total_revenue: number;
                total_transactions: number;
                wallet_balance: number;
                current_month_revenue: number;
                previous_month_revenue: number;
                monthly_growth_percentage: number;
            };
            recent_transactions: any[];
        };
    }>;
    getQr(u: any): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
            qr_image_data_url: string;
        };
    }>;
    transactions(u: any, q: any): Promise<{
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
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    payout(u: any, dto: PayoutDto): Promise<{
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
    payouts(u: any, q: any): Promise<{
        data: {
            amount: number;
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
    regenQr(u: any): Promise<{
        data: {
            qr_payload: string;
            qr_image_base64: string;
            qr_image_data_url: string;
        };
    }>;
}
export {};
