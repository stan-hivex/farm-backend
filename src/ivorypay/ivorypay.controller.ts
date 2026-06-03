import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WebhookService } from '../webhook/webhook.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';

@Controller({
  path: 'ivorypay',
  version: '1',
})
export class IvorypayController {
  constructor(private readonly webhookService: WebhookService) {}

  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  async webhook(@Body() body: any) {
    return this.webhookService.handleIvorypayWebhook(body, true);
  }
}
