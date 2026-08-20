import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { PaymentProcessor } from './payment.processor';
import { QUEUES } from '../common/constants';

@Injectable()
@Processor(QUEUES.WEBHOOKS)
export class WebhookProcessor implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly paymentProcessor: PaymentProcessor,
    @InjectQueue(QUEUES.WEBHOOKS) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'failed', 1000);
      await this.queue.clean(24 * 60 * 60 * 1000, 'completed', 1000);
      this.logger.log('Cleaned aged webhook queue jobs');
    } catch (error) {
      this.logger.warn(`Failed to clean aged webhook queue jobs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
