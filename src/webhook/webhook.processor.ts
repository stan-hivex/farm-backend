import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PaymentProcessor } from './payment.processor';
import { BullmqService } from '../common/bullmq/bullmq.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookProcessor implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly paymentProcessor: PaymentProcessor,
    private readonly cfg: ConfigService,
    @Optional() private readonly bull: BullmqService,
  ) {}

  onModuleInit() {
    const queueName = this.cfg.get<string>('WEBHOOK_QUEUE_NAME', 'webhook');
    if (!this.bull) {
      this.logger.warn('WebhookProcessor worker not initialized: BullmqService not available');
      return;
    }

    this.logger.log(`WebhookProcessor starting worker for queue=${queueName}`);
    this.bull.createWorker(queueName, async (job: any) => {
      return this.processWebhookQueue(job);
    });
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
