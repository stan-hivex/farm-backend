import { Injectable, Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { PaymentProcessorService } from '../payments/payment-processor.service';

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
    private readonly paymentProcessorService: PaymentProcessorService,
  ) {}

  async process(job: WebhookQueueJob) {
    if (!job || !job.provider) {
      this.logger.warn('Received invalid webhook job');
      return;
    }

    try {
      if (job.provider === 'paystack') {
        if (job.event === 'charge.success') {
          await this.paymentProcessorService.processDeposit(job.reference);
        } else {
          await this.webhookService.handlePaystackWebhookProcessing(job.payload);
        }
      } else if (job.provider === 'ivorypay') {
        if (['payment.success', 'transaction.completed', 'success'].includes(job.event)) {
          await this.paymentProcessorService.processDeposit(job.reference);
        } else {
          await this.webhookService.handleIvorypayWebhookProcessing(job.payload);
        }
      } else {
        this.logger.warn(`Unsupported webhook provider: ${job.provider}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process webhook job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
