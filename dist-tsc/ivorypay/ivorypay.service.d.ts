import { ConfigService } from '@nestjs/config';
export declare class IvorypayService {
    private readonly cfg;
    private readonly logger;
    private readonly baseUrl;
    private readonly apiKey;
    constructor(cfg: ConfigService);
    private maskAddress;
    private normalizeToken;
    getProviderNetworks(token?: string): {
        success: boolean;
        token: string;
        networks: string[];
    };
    private normalizeNetwork;
    private validateAddressForNetwork;
    private scanProviderIdentifiers;
    extractProviderIdentifiers(data: any): Record<string, any>;
    private extractUuidFromString;
    private extractLookupIdentifier;
    private determinePrimaryProviderReference;
    private determinePrimaryProviderTransactionId;
    createPayment(options: any): Promise<{
        data: {
            payment_link: string;
        };
        payment_link: string;
        checkout_url: string;
        rawResponse?: undefined;
        providerReference?: undefined;
        providerTransactionId?: undefined;
        providerIdentifiers?: undefined;
        redirectUrl?: undefined;
    } | {
        rawResponse: any;
        data: any;
        payment_link: any;
        checkout_url: any;
        providerReference: any;
        providerTransactionId: any;
        providerIdentifiers: Record<string, any>;
        redirectUrl: any;
    }>;
    verifyTransaction(reference: string, providerReference?: string, fallbackReferences?: string[]): Promise<any>;
    createWithdrawal(options: any): Promise<{
        rawResponse: any;
        data: any;
        providerReference: any;
        providerTransactionId: any;
    }>;
}
