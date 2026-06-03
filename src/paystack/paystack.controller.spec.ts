import { PaystackController } from './paystack.controller';
import { IvorypayController } from '../ivorypay/ivorypay.controller';

describe('Provider-specific webhook controllers', () => {
  it('passes verified=true to Paystack webhook handling', async () => {
    const body = { event: 'charge.success', data: { reference: 'ref123' } };
    const mockWebhookService = {
      handlePaystackWebhook: jest.fn().mockResolvedValue({ received: true }),
    } as any;

    const controller = new PaystackController(mockWebhookService);
    await controller.webhook(body);

    expect(mockWebhookService.handlePaystackWebhook).toHaveBeenCalledWith(body, true);
  });

  it('passes verified=true to Ivorypay webhook handling', async () => {
    const body = { event: 'payment.success', data: { reference: 'ref456' } };
    const mockWebhookService = {
      handleIvorypayWebhook: jest.fn().mockResolvedValue({ received: true }),
    } as any;

    const controller = new IvorypayController(mockWebhookService);
    await controller.webhook(body);

    expect(mockWebhookService.handleIvorypayWebhook).toHaveBeenCalledWith(body, true);
  });
});
