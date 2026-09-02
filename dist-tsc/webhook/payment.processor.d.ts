import { WebhookService } from './webhook.service';
export interface WebhookQueueJob {
    provider: string;
    event: string;
    reference: string;
    payload: any;
    receivedAt?: number;
}
export declare class PaymentProcessor {
    private readonly webhookService;
    private readonly logger;
    constructor(webhookService: WebhookService);
    process(job: WebhookQueueJob): Promise<void>;
}
