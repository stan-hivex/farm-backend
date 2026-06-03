import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WebhookService } from '../webhook/webhook.service';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';

@Controller({
  path: 'paystack',
  version: '1',
})
export class PaystackController {
  constructor(private readonly webhookService: WebhookService) {}

  @UseGuards(WebhookSignatureGuard)
  @Post('webhook')
  async webhook(@Body() body: any) {
    return this.webhookService.handlePaystackWebhook(body, true);
  }
}
