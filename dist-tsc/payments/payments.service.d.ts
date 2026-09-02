import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { CacheService } from '../common/cache/cache.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
export declare class PaymentsService {
    private prisma;
    private cfg;
    private ivorypay;
    private paystack;
    private cache;
    private currencyConversionService;
    private readonly logger;
    constructor(prisma: PrismaService, cfg: ConfigService, ivorypay: IvorypayService, paystack: PaystackService, cache: CacheService, currencyConversionService: CurrencyConversionService);
    initiateDeposit(userId: string, dto: {
        amount_fiat: number;
        currency: string;
        paymentMethod?: string;
        phone?: string;
    }, ctx?: {
        deviceRisk?: number;
        ip?: string;
        country?: string;
    }): Promise<{
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
    getExchangeRate(from: string, to: string): Promise<number>;
    private assessFraudRisk;
    getDepositHistory(userId: string): Promise<{
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
    getWithdrawalHistory(userId: string): Promise<{
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
