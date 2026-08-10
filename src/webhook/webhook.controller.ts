import { Body, Controller, Get, Post, UseGuards, Optional } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { ConfigService } from '@nestjs/config';
import { BullmqService } from '../common/bullmq/bullmq.service';

@Controller({
  path: 'webhooks',
  version: '1',
})
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly cfg: ConfigService,
    @Optional() private readonly bull?: BullmqService,
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
    const queueName = this.cfg.get<string>('WEBHOOK_QUEUE_NAME', 'webhook');
    const jobId = this.getWebhookJobId('paystack', body);
    if (this.bull) {
      const q = this.bull.getQueue(queueName) ?? this.bull.createQueue(queueName);
      await q.add(jobId, { provider: 'paystack', event: body.event, reference: body.data?.reference, payload: body, receivedAt: Date.now() });
      return { received: true, queued: true };
    }

    await this.webhookService.handlePaystackWebhook(body, true);
    return { received: true, queued: false };
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
    const queueName = this.cfg.get<string>('WEBHOOK_QUEUE_NAME', 'webhook');
    const jobId = this.getWebhookJobId('ivorypay', body);
    if (this.bull) {
      const q = this.bull.getQueue(queueName) ?? this.bull.createQueue(queueName);
      await q.add(jobId, { provider: 'ivorypay', event: body.event ?? body.status, reference: body.data?.reference ?? body.reference, payload: body, receivedAt: Date.now() });
      return { received: true, queued: true };
    }

    await this.webhookService.handleIvorypayWebhook(body, true);
    return { received: true, queued: false };
  }

  @Get('ivorypay')
  async ivorypayHealth() {
    return { status: 'ok', provider: 'ivorypay' };
  }
}

@Controller('webhooks')
export class WebhookNoVersionController {
  constructor(private readonly webhookService: WebhookService) {}

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

  @Get('ivorypay')
  async ivorypayHealth() {
    return { status: 'ok', provider: 'ivorypay', version: 'none' };
  }
}

@Controller({
  path: 'ivorypay',
  version: '1',
})
export class IvorypayWebhookAliasController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('webhook')
  async webhookHealth() {
    return { status: 'ok', provider: 'ivorypay' };
  }

  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  async webhook(@Body() body: any) {
    await this.webhookService.handleIvorypayWebhook(body, true);
    return { received: true };
  }
}

@Controller('ivorypay')
export class IvorypayWebhookNoVersionController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('webhook')
  async webhookHealth() {
    return { status: 'ok', provider: 'ivorypay', version: 'none' };
  }

  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  async webhook(@Body() body: any) {
    await this.webhookService.handleIvorypayWebhook(body, true);
    return { received: true };
  }
}
