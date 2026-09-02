import { OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bull';
import { PaymentProcessor } from './payment.processor';
export declare class WebhookProcessor implements OnModuleInit {
    private readonly paymentProcessor;
    private readonly queue;
    private readonly logger;
    constructor(paymentProcessor: PaymentProcessor, queue: Queue);
    onModuleInit(): Promise<void>;
    handleWebhookJob(job: Job<any>): Promise<void>;
    processWebhookQueue(job: Job<any>): Promise<void>;
}
