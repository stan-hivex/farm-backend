import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { QUEUES } from '../common/constants';

@Controller({
  path: 'webhooks',
  version: '1',
})
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    @InjectQueue(QUEUES.WEBHOOKS) private readonly webhookQueue: Queue,
  ) {}

  private getWebhookJobId(provider: string, payload: any) {
    const eventId = payload.id ?? payload.data?.id ?? payload.data?.reference ?? payload.reference;
    return eventId ? `${provider}:${eventId}` : `${provider}:anonymous:${Date.now()}`;
  }

  @UseGuards(WebhookSignatureGuard)
  @Throttle({
    default: {
      limit: 20,
      ttl: 60000,
    },
  })
  @Post('paystack')
async paystack(@Body() body: any) {
  await this.webhookService.handlePaystackWebhook(body, true);
  return { received: true };
}

  @UseGuards(WebhookSignatureGuard)
  @Throttle({
    default: {
      limit: 20,
      ttl: 60000,
    },
  })
  @Post('ivorypay')
async ivorypay(@Body() body: any) {
  await this.webhookService.handleIvorypayWebhook(body, true);
  return { received: true };
}
}
