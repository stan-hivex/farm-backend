import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  async initializePayment(options: any) {
    this.logger.log(`Mock Paystack initialize payment ${options.reference}`);
    return {
      authorization_url: 'https://paystack.mock/authorize',
      authorizationUrl: 'https://paystack.mock/authorize',
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
