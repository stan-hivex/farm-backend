import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { PaymentProcessor } from './payment.processor';
import { QUEUES } from '../common/constants';

@Injectable()
@Processor(QUEUES.WEBHOOKS)
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly paymentProcessor: PaymentProcessor) {}

  @Process()
  async handleWebhookJob(job: Job<any>) {
    return this.processWebhookQueue(job);
  }

  async processWebhookQueue(job: Job<any>) {
    if (!job?.data) {
      this.logger.warn('Received empty webhook job');
      return;
    }

    try {
      await this.paymentProcessor.process(job.data);
    } catch (error) {
      this.logger.error(`Failed to process webhook job: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
