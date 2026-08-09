import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentProcessor } from './payment.processor';
import { QUEUES } from '../common/constants';
import { BullmqService } from '../common/bullmq.service';

@Injectable()
export class WebhookProcessor implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly paymentProcessor: PaymentProcessor,
    private readonly bullmq: BullmqService,
  ) {}

  onModuleInit() {
    this.bullmq.createWorker(QUEUES.WEBHOOKS, async (job: Job) => {
      return this.processWebhookQueue(job);
    });
  }

  async processWebhookQueue(job: Job) {
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
