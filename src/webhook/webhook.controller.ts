import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WebhookService } from './webhook.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';

@Controller({
  path: 'webhooks',
  version: '1',
})
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

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
