import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string | undefined;
  private readonly paystackBaseUrl = 'https://api.paystack.co';

  constructor(private cfg: ConfigService) {
    this.secretKey = this.cfg.get<string>('PAYSTACK_SECRET_KEY');
  }

  async initializePayment(options: any) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock response');
      return {
        authorization_url: `https://checkout.paystack.com/mock/${options.reference}`,
        authorizationUrl: `https://checkout.paystack.com/mock/${options.reference}`,
      };
    }

    try {
      this.logger.log(`Paystack: initializing transaction for ${options.reference}`);
      const requestBody: any = {
        email: options.email,
        amount: this.toPaystackAmount(options.amount),
        reference: options.reference,
        ...(options.channels && { channels: options.channels }),
        ...(options.phone && { phone: options.phone }),
        ...(options.metadata && { metadata: options.metadata }),
      };

      if (options.currency) {
        requestBody.currency = options.currency;
      }

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data.status || !response.data.data) {
        this.logger.error('Paystack initialized with invalid response body', response.data);
        throw new BadRequestException('Invalid Paystack response');
      }

      this.logger.log(`Paystack: initialized ${options.reference}, auth_url=${response.data.data.authorization_url}`);
      return {
        authorization_url: response.data.data.authorization_url,
        authorizationUrl: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
      };
    } catch (e: any) {
      const message = e.response?.data?.message || e.message;
      this.logger.error(`Paystack initialize error: ${message}`);
      if (e.response?.data) {
        this.logger.debug(`Paystack initialize error details: ${JSON.stringify(e.response.data)}`);
      }
      throw new BadRequestException(`Paystack integration failed: ${message}`);
    }
  }

  async verifyTransaction(reference: string) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock verify');
      return { status: 'success', reference };
    }

    try {
      this.logger.log(`Paystack: verifying transaction ${reference}`);
      const response = await axios.get(`${this.paystackBaseUrl}/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      if (!response.data.status) {
        throw new BadRequestException('Transaction verification failed');
      }

      this.logger.log(`Paystack: verified ${reference}, status=${response.data.data?.status}`);
      return response.data.data;
    } catch (e: any) {
      this.logger.error(`Paystack verify error: ${e.response?.data?.message || e.message}`);
      throw new BadRequestException(`Paystack verification failed: ${e.response?.data?.message || e.message}`);
    }
  }

  async createTransferRecipient(payload: any) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock recipient');
      return { recipient_code: 'RCP_MOCK_123456' };
    }

    try {
      const response = await axios.post(
        `${this.paystackBaseUrl}/transferrecipient`,
        payload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException('Failed to create transfer recipient');
      }

      return response.data.data;
    } catch (e: any) {
      this.logger.error(`Paystack recipient creation error: ${e.response?.data?.message || e.message}`);
      throw new BadRequestException(`Paystack recipient failed: ${e.response?.data?.message || e.message}`);
    }
  }

  private toPaystackAmount(amount: number | string) {
    const value = Number(amount);
    if (Number.isNaN(value)) {
      throw new BadRequestException('Invalid amount for Paystack initialization');
    }
    return Math.round(value * 100);
  }

  async initiateTransfer(payload: any) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock transfer');
      return { status: 'success', data: { id: 'TRF_MOCK_123456' } };
    }

    try {
      const response = await axios.post(
        `${this.paystackBaseUrl}/transfer`,
        payload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException('Failed to initiate transfer');
      }

      return response.data;
    } catch (e: any) {
      this.logger.error(`Paystack transfer error: ${e.response?.data?.message || e.message}`);
      throw new BadRequestException(`Paystack transfer failed: ${e.response?.data?.message || e.message}`);
    }
  }
}
