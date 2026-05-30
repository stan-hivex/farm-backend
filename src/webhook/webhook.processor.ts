import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Processor('webhooks')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Process('paystack')
  async processPaystack(job: Job<{ provider: string; payload: any; verified?: boolean }>) {
    this.logger.debug(`Processing Paystack webhook job ${job.id}`);
    try {
      await this.webhookService.handlePaystackWebhook(job.data.payload, job.data.verified ?? false);
    } catch (error) {
      this.logger.error(`Paystack webhook job failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Process('ivorypay')
  async processIvorypay(job: Job<{ provider: string; payload: any; verified?: boolean }>) {
    this.logger.debug(`Processing Ivorypay webhook job ${job.id}`);
    try {
      await this.webhookService.handleIvorypayWebhook(job.data.payload, job.data.verified ?? false);
    } catch (error) {
      this.logger.error(`Ivorypay webhook job failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
