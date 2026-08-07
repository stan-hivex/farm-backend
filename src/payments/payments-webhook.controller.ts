import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { WebhookService } from '../webhook/webhook.service';

@Controller({ path: 'payments/webhooks', version: '1' })
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(private readonly webhookService: WebhookService) {
    // Log the exact registered route during application startup
    this.logger.log('Registered route: /api/v1/payments/webhooks/ivorypay (GET, POST)');
  }

  @Get('ivorypay')
  health() {
    this.logger.log('Ivorypay webhook health check reached');
    return { success: true, message: 'Ivorypay webhook endpoint is alive' };
  }

  // Intentionally not guarded so providers can POST anonymously.
  @Post('ivorypay')
  async ivorypay(@Req() req: any, @Body() body: any) {
    try {
      this.logger.log('Ivorypay webhook reached');
      try {
        this.logger.log(`Ivorypay webhook headers: ${JSON.stringify(req.headers || {}, null, 2)}`);
      } catch (e) {
        this.logger.warn('Failed to stringify headers for logging');
      }

      // Log raw body (saved by rawBody middleware)
      try {
        this.logger.log(`Ivorypay webhook rawBody: ${typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.rawBody)}`);
      } catch (e) {
        this.logger.warn('Failed to log rawBody');
      }

      // Log parsed body
      try {
        this.logger.log(`Ivorypay webhook parsed body: ${JSON.stringify(body, null, 2)}`);
      } catch (e) {
        this.logger.warn('Failed to stringify parsed body for logging');
      }

      const result = await this.webhookService.handleIvorypayWebhook(body, false);
      this.logger.log(`Ivorypay webhook handler result: ${JSON.stringify(result)}`);
      return result ?? { received: true };
    } catch (err) {
      this.logger.error('Ivorypay webhook handler exception', err as any);
      // Ensure any exception is logged and returned with minimal info
      return { received: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Temporary admin endpoint to trigger the Cron job manually for testing.
  @Post('ivorypay/trigger-fix')
  async triggerFix() {
    this.logger.log('Manual trigger invoked: fixStuckDeposits');
    try {
      await this.webhookService.fixStuckDeposits();
      return { ok: true, message: 'fixStuckDeposits triggered' };
    } catch (e: any) {
      this.logger.error('Manual trigger failed', e as any);
      return { ok: false, error: e?.message ?? String(e) };
    }
  }
}
