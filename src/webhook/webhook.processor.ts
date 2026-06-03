import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';
import type { Redis } from 'ioredis';

@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);
  private isProcessing = false;
  private readonly QUEUE_KEY = 'payment:webhook:queue';
  private readonly BATCH_SIZE = 10; // Process up to 10 webhooks per cycle

  constructor(
    private readonly webhookService: WebhookService,
    private readonly cfg: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis | null,
  ) {
    // Log if Redis is unavailable
    if (!redis) {
      this.logger.warn('WebhookProcessor: Redis client is unavailable. Queued webhooks will not be processed.');
    }
  }

  /**
   * Process queued webhooks every 5 seconds.
   * This ensures that queued webhook events are processed asynchronously
   * without blocking the HTTP response to the webhook provider.
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processQueuedWebhooks() {
    if (!this.redis) {
      return;
    }

    // Prevent overlapping processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.processWebhookBatch();
    } catch (error) {
      this.logger.error('Error processing webhook batch', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processWebhookBatch() {
    const webhooks: string[] = [];

    try {
      // Pop up to BATCH_SIZE webhooks from the queue
      for (let i = 0; i < this.BATCH_SIZE; i++) {
        const webhook = await this.redis!.rpop(this.QUEUE_KEY);
        if (!webhook) {
          break;
        }
        webhooks.push(webhook);
      }

      if (webhooks.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${webhooks.length} queued webhooks`);

      // Process each webhook
      for (const webhookJson of webhooks) {
        try {
          const webhookEntry = JSON.parse(webhookJson);
          const { provider, event, payload, reference } = webhookEntry;

          if (provider === 'paystack') {
            await this.webhookService.handlePaystackWebhookProcessing(payload);
          } else if (provider === 'ivorypay') {
            await this.webhookService.handleIvorypayWebhookProcessing(payload);
          } else {
            this.logger.warn(`Unknown webhook provider: ${provider}`);
          }
        } catch (error) {
          this.logger.error(`Failed to process webhook: ${error instanceof Error ? error.message : String(error)}`);
          // Continue processing other webhooks even if one fails
        }
      }
    } catch (error) {
      this.logger.error('Error in processWebhookBatch', error);
      // Re-queue failed webhooks (if any were not processed)
      for (const webhook of webhooks) {
        try {
          await this.redis!.lpush(this.QUEUE_KEY, webhook);
        } catch (e) {
          this.logger.error('Failed to re-queue webhook after batch error', e);
        }
      }
    }
  }
}
