import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IvorypayService {
  private readonly logger = new Logger(IvorypayService.name);

  async createPayment(options: any) {
    this.logger.log(`Mock Ivorypay create payment ${options.reference}`);
    return {
      data: { payment_link: 'https://ivorypay.mock/pay' },
      payment_link: 'https://ivorypay.mock/pay',
      checkout_url: 'https://ivorypay.mock/checkout',
    };
  }

  async createWithdrawal(options: any) {
    this.logger.log(`Mock Ivorypay create withdrawal ${options.reference}`);
    return { data: { id: 'WD_123456' }, id: 'WD_123456' };
  }
}
