import { WebhookService } from '../webhook/webhook.service';
export declare class IvorypayController {
    private readonly webhookService;
    constructor(webhookService: WebhookService);
    webhook(body: any): Promise<{
        received: boolean;
    }>;
}
