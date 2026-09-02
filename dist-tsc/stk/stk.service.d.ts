import { ConfigService } from '@nestjs/config';
export declare class StkPushService {
    private cfg;
    private readonly logger;
    private readonly baseUrl;
    private readonly consumerKey;
    private readonly consumerSecret;
    private readonly shortCode;
    private readonly passKey;
    private readonly callbackUrl;
    private readonly transactionType;
    private readonly enabled;
    constructor(cfg: ConfigService);
    private formatPhone;
    private formatTimestamp;
    private formatPassword;
    private getAccessToken;
    initiatePush(data: {
        phone: string;
        amount: number;
        reference: string;
        accountReference?: string;
        description?: string;
    }): Promise<any>;
}
