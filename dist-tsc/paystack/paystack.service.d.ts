import { ConfigService } from '@nestjs/config';
export declare class PaystackService {
    private cfg;
    private readonly logger;
    private readonly secretKey;
    private readonly paystackBaseUrl;
    private readonly bankCodeMap;
    private readonly kenyaBankCodeFallback;
    constructor(cfg: ConfigService);
    initializePayment(options: any): Promise<{
        authorization_url: string;
        authorizationUrl: string;
        access_code?: undefined;
    } | {
        authorization_url: any;
        authorizationUrl: any;
        access_code: any;
    }>;
    verifyTransaction(reference: string): Promise<any>;
    createTransferRecipient(payload: any): Promise<any>;
    private banksCache;
    getBankCodeByName(bankName: string, country?: string): Promise<any>;
    private normalizeBankName;
    private toPaystackAmount;
    private formatPhoneForPaystack;
    initiateTransfer(payload: any): Promise<any>;
    getTransferStatus(transferCode: string): Promise<any>;
}
