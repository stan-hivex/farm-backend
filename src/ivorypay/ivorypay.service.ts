import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IvorypayService {
  private readonly logger = new Logger(IvorypayService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(private readonly cfg: ConfigService) {
    const rawBaseUrl = this.cfg.get<string>('IVORYPAY_BASE_URL', 'https://api.ivorypay.io/api');
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.apiKey = this.cfg.get<string>('IVORYPAY_API_KEY');
  }

  async createPayment(options: any) {
    if (!this.apiKey) {
      this.logger.warn('IVORYPAY_API_KEY not configured, returning mock checkout URL');
      const paymentLink = `${this.baseUrl}/pay/${options.reference}`;
      return {
        data: { payment_link: paymentLink },
        payment_link: paymentLink,
        checkout_url: paymentLink,
      };
    }

    try {
      this.logger.log(`Ivorypay: creating payment ${options.reference} via ${this.baseUrl}`);
      const response = await axios.post(
        `${this.baseUrl}/v1/transactions`,
        {
          amount: options.amount,
          currency: options.currency,
          reference: options.reference,
          email: options.email,
          description: options.description,
          metadata: options.metadata ?? {},
        },
        {
          headers: {
            Authorization: `${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = response.data?.data ?? response.data;
      if (!data) {
        this.logger.error('Ivorypay createPayment returned invalid response', response.data);
        throw new BadRequestException('Invalid Ivorypay response');
      }

      const paymentLink = data.payment_link || data.checkout_url || data.url || data.link;
      if (!paymentLink) {
        this.logger.error('Ivorypay createPayment did not return a checkout URL', data);
        throw new BadRequestException('Ivorypay checkout URL not provided');
      }

      return {
        data,
        payment_link: paymentLink,
        checkout_url: paymentLink,
      };
    } catch (e: any) {
      const message = e.response?.data?.message || e.response?.data?.error || e.message;
      const statusCode = e.response?.status;
      const endpoint = `${this.baseUrl}/v1/checkout`;
      
      this.logger.error(
        `Ivorypay createPayment error [${statusCode}] ${endpoint}: ${message}`,
      );
      if (e.response?.data) {
        this.logger.debug(`Ivorypay response body: ${JSON.stringify(e.response.data)}`);
      }
      if (e.response?.status === 404) {
        this.logger.warn(
          'Ivorypay endpoint returned 404. Verify IVORYPAY_BASE_URL and endpoint path. ' +
          'Common endpoints: /v1/checkout, /v1/transactions/initialize, /transactions/create',
        );
      }
      throw new BadRequestException(`Ivorypay integration failed: ${message}`);
    }
  }

  async createWithdrawal(options: any) {
    this.logger.log(`Mock Ivorypay create withdrawal ${options.reference}`);
    return { data: { id: 'WD_123456' }, id: 'WD_123456' };
  }
}
