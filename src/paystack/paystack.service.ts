import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  async initializePayment(options: any) {
    this.logger.log(`Mock Paystack initialize payment ${options.reference}`);
    // Return a real Paystack checkout host so redirects work in deployed environments.
    // In production this service should call Paystack's API; for now provide a checkout URL.
    const base = 'https://checkout.paystack.com';
    const path = options.reference ? `/${options.reference}` : '';
    return {
      authorization_url: `${base}${path}`,
      authorizationUrl: `${base}${path}`,
    };
  }

  async verifyTransaction(reference: string) {
    this.logger.log(`Mock Paystack verify transaction ${reference}`);
    return { status: 'success', reference };
  }

  async createTransferRecipient(payload: any) {
    this.logger.log(`Mock Paystack create transfer recipient ${payload.type}`);
    return { recipient_code: 'RCP_123456' };
  }

  async initiateTransfer(payload: any) {
    this.logger.log(`Mock Paystack initiate transfer ${payload.reference}`);
    return { status: 'success', data: { id: 'TRF_123456' } };
  }
}
