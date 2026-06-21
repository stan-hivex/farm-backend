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
      const body: any = {
        amount: options.amount,
        reference: options.reference,
        email: options.email,
        type: 'CRYPTO',
        mode: 'CHECKOUT',
        baseFiat: options.baseFiat || 'KES',
        crypto: options.crypto || 'USDT',
        metadata: options.metadata ? (typeof options.metadata === 'string' ? options.metadata : JSON.stringify(options.metadata)) : null,
      };

      const response = await axios.post(`${this.baseUrl}/v1/transactions`, body,
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

      const paymentLink =
        data.payment_link ||
        data.checkout_url ||
        data.url ||
        data.link ||
        data.checkout ||
        data.page_url ||
        data.collectionDetails?.checkoutUrl;
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
      const endpoint = `${this.baseUrl}/v1/transactions`;
      
      this.logger.error(
        `Ivorypay createPayment error [${statusCode}] ${endpoint}: ${message}`,
      );
      if (e.response?.data?.errors) {
        this.logger.debug(`Ivorypay validation errors: ${JSON.stringify(e.response.data.errors)}`);
      }
      if (e.response?.data) {
        this.logger.debug(`Ivorypay response body: ${JSON.stringify(e.response.data)}`);
      }
      throw new BadRequestException(`Ivorypay integration failed: ${message}`);
    }
  }

  async verifyTransaction(reference: string) {
    if (!this.apiKey) {
      this.logger.warn('IVORYPAY_API_KEY not configured, returning mock verify');
      return { status: 'completed', reference };
    }

    try {
      this.logger.log(`Ivorypay: verifying transaction ${reference}`);
      const response = await axios.get(
        `${this.baseUrl}/v1/transactions/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data || response.data.success === false) {
        throw new BadRequestException('Ivorypay verification failed');
      }

      const verifiedData = response.data.data ?? response.data;
      const status = verifiedData?.status ?? response.data?.status;
      if (!status) {
        this.logger.warn(`Ivorypay verify response for ${reference} missing status field: ${JSON.stringify(response.data)}`);
        throw new BadRequestException('Ivorypay verification failed: missing status field');
      }

      this.logger.log(`Ivorypay: verified ${reference}, status=${status}`);
      return verifiedData;
    } catch (e: any) {
      const message = e.response?.data?.message || e.response?.data?.error || e.message;
      this.logger.error(`Ivorypay verify error: ${message}`);
      if (e.response?.data) {
        this.logger.debug(`Ivorypay verify response body: ${JSON.stringify(e.response.data)}`);
      }
      throw new BadRequestException(`Ivorypay verification failed: ${message}`);
    }
  }

  async createWithdrawal(options: any) {
    this.logger.log(`Mock Ivorypay create withdrawal ${options.reference}`);
    return { data: { id: 'WD_123456' }, id: 'WD_123456' };
  }
}
