import { WebhookService } from './webhook.service';
export declare class WebhookController {
    private readonly webhookService;
    constructor(webhookService: WebhookService);
    private getWebhookJobId;
    paystack(body: any): Promise<{
        received: boolean;
    }>;
    ivorypay(body: any): Promise<{
        received: boolean;
    }>;
    ivorypayHealth(): Promise<{
        status: string;
        provider: string;
    }>;
}
export declare class WebhookNoVersionController {
    private readonly webhookService;
    constructor(webhookService: WebhookService);
    paystack(body: any): Promise<{
        received: boolean;
    }>;
    ivorypay(body: any): Promise<{
        received: boolean;
    }>;
    ivorypayHealth(): Promise<{
        status: string;
        provider: string;
        version: string;
    }>;
}
export declare class IvorypayWebhookAliasController {
    private readonly webhookService;
    constructor(webhookService: WebhookService);
    webhookHealth(): Promise<{
        status: string;
        provider: string;
    }>;
    webhook(body: any): Promise<{
        received: boolean;
    }>;
}
export declare class IvorypayWebhookNoVersionController {
    private readonly webhookService;
    constructor(webhookService: WebhookService);
    webhookHealth(): Promise<{
        status: string;
        provider: string;
        version: string;
    }>;
    webhook(body: any): Promise<{
        received: boolean;
    }>;
}
