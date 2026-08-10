import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PaymentProcessor } from './payment.processor';

@Injectable()
export class WebhookProcessor implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly paymentProcessor: PaymentProcessor) {}

  onModuleInit() {
    this.logger.warn('WebhookProcessor worker is disabled because async queue support was removed.');
  }

  async processWebhookQueue(job: any) {
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
