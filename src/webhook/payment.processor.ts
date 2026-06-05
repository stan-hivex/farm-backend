import { Injectable, Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';

export interface WebhookQueueJob {
  provider: string;
  event: string;
  reference: string;
  payload: any;
  receivedAt?: number;
}

@Injectable()
export class PaymentProcessor {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly webhookService: WebhookService,
  ) {}

  async process(job: WebhookQueueJob) {
    if (!job || !job.provider) {
      this.logger.warn('Received invalid webhook job');
      return;
    }

    try {
      // Route all webhook events through WebhookService for consistent processing,
      // validation, and wallet credit (which ONLY happens in WebhookService)
      if (job.provider === 'paystack') {
        await this.webhookService.handlePaystackWebhookProcessing(job.payload);
      } else if (job.provider === 'ivorypay') {
        await this.webhookService.handleIvorypayWebhookProcessing(job.payload);
      } else {
        this.logger.warn(`Unsupported webhook provider: ${job.provider}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process webhook job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
