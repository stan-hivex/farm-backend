import { DepositService } from './deposit.service';
declare class CreateDepositDto {
    amount_fiat: number;
    currency?: string;
    paymentMethod?: string;
    payment_method?: string;
    method?: string;
    payment_channel?: string;
    payment_provider?: string;
    provider?: string;
    phone?: string;
    email?: string;
}
export declare class DepositController {
    private readonly depositService;
    constructor(depositService: DepositService);
    create(req: any, dto: CreateDepositDto): Promise<{
        data: {
            provider: string;
            reference: string;
            payment_url: any;
            authorization_url: any;
        };
        message: string;
        success?: undefined;
        payment_url?: undefined;
        authorization_url?: undefined;
        reference?: undefined;
        deposit?: undefined;
    } | {
        success: boolean;
        payment_url: string | null;
        authorization_url: string | null;
        reference: string;
        deposit: {
            id: string;
            status: import("@prisma/client").$Enums.DepositStatus;
            currency: string;
            userId: string;
            amount: number;
            total: number;
            fee: number;
            paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
            reference: string;
            providerRef: string | null;
            providerTransactionId: string | null;
            providerReference: string | null;
            checkoutId: string | null;
            paymentReference: string | null;
            merchantReference: string | null;
            providerPayload: import("@prisma/client/runtime/library").JsonValue | null;
            verificationPayload: import("@prisma/client/runtime/library").JsonValue | null;
            blockchainTransactionHash: string | null;
            verifiedAt: Date | null;
            creditedAt: Date | null;
            webhookReceived: Date | null;
            verificationAttempts: number | null;
            createdAt: Date;
            updatedAt: Date;
            provider: string | null;
        };
        data?: undefined;
        message?: undefined;
    }>;
    history(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            status: import("@prisma/client").$Enums.DepositStatus;
            currency: string;
            userId: string;
            amount: number;
            total: number;
            fee: number;
            paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
            reference: string;
            providerRef: string | null;
            providerTransactionId: string | null;
            providerReference: string | null;
            checkoutId: string | null;
            paymentReference: string | null;
            merchantReference: string | null;
            providerPayload: import("@prisma/client/runtime/library").JsonValue | null;
            verificationPayload: import("@prisma/client/runtime/library").JsonValue | null;
            blockchainTransactionHash: string | null;
            verifiedAt: Date | null;
            creditedAt: Date | null;
            webhookReceived: Date | null;
            verificationAttempts: number | null;
            createdAt: Date;
            updatedAt: Date;
            provider: string | null;
        }[];
    }>;
    wallet(req: any): Promise<{
        balance: number | import("@prisma/client/runtime/library").Decimal;
        locked_balance: number | import("@prisma/client/runtime/library").Decimal;
    }>;
    getOne(id: string, req: any): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.DepositStatus;
        currency: string;
        userId: string;
        amount: number;
        total: number;
        fee: number;
        paymentMethod: import("@prisma/client").$Enums.PaymentMethod;
        reference: string;
        providerRef: string | null;
        providerTransactionId: string | null;
        providerReference: string | null;
        checkoutId: string | null;
        paymentReference: string | null;
        merchantReference: string | null;
        providerPayload: import("@prisma/client/runtime/library").JsonValue | null;
        verificationPayload: import("@prisma/client/runtime/library").JsonValue | null;
        blockchainTransactionHash: string | null;
        verifiedAt: Date | null;
        creditedAt: Date | null;
        webhookReceived: Date | null;
        verificationAttempts: number | null;
        createdAt: Date;
        updatedAt: Date;
        provider: string | null;
    } | null>;
}
export {};
