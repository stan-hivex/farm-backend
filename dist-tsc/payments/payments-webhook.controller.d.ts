import { WebhookService } from '../webhook/webhook.service';
export declare class PaymentsWebhookController {
    private readonly webhookService;
    private readonly logger;
    constructor(webhookService: WebhookService);
    health(): {
        success: boolean;
        message: string;
    };
    ivorypay(req: any, body: any): Promise<{
        received: boolean;
    } | {
        received: boolean;
        error: string;
    }>;
    triggerFix(): Promise<{
        ok: boolean;
        message: string;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        message?: undefined;
    }>;
}
