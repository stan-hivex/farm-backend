import { IvorypayDepositService } from './ivorypay-deposit.service';
export declare class CryptoController {
    private readonly ivorypayDepositService;
    constructor(ivorypayDepositService: IvorypayDepositService);
    deposit(req: any, dto: any): Promise<{
        success: boolean;
        data: {
            reference: string;
            payment_url: any;
            authorization_url: any;
        };
        message: string;
    }>;
    status(reference: string): Promise<{
        success: boolean;
        data: {
            reference: string;
            status: import("@prisma/client").$Enums.DepositStatus;
            provider: string | null;
        };
    }>;
    webhook(body: any): Promise<{
        processed: boolean;
        reason: string;
        duplicate?: undefined;
        reference?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        duplicate: boolean;
        reference: string;
        reason?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        reference: string;
        status: string;
        reason?: undefined;
        duplicate?: undefined;
    } | {
        processed: boolean;
        reason: string;
        reference: string;
        duplicate?: undefined;
        status?: undefined;
    } | {
        processed: boolean;
        reason: string;
        reference: string;
        status: any;
        duplicate?: undefined;
    }>;
}
