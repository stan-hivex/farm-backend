import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class IvorypayService {
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor(private cfg: ConfigService) {
    this.secret = this.cfg.get<string>('IVORYPAY_SECRET_KEY') || process.env.IVORYPAY_SECRET_KEY || '';
    this.baseUrl = this.cfg.get<string>('IVORYPAY_BASE_URL') || process.env.IVORYPAY_BASE_URL || 'https://api.ivorypay.co';
  }

  async createPayment(data: {
    amount: number;
    currency: string;
    reference: string;
    email: string;
  }) {
    const callback = this.cfg.get<string>('IVORYPAY_CALLBACK_URL', 'https://api.yourdomain.com/api/v1/webhooks/ivorypay');
    const success = this.cfg.get<string>('IVORYPAY_SUCCESS_URL', 'https://app.yourdomain.com/payment-success');
    const failure = this.cfg.get<string>('IVORYPAY_FAILURE_URL', 'https://app.yourdomain.com/payment-failed');

    const response = await axios.post(
      `${this.baseUrl}/payments`,
      {
        amount: data.amount,
        currency: data.currency,
        reference: data.reference,

        customer: {
          email: data.email,
        },

        callback_url: callback,

        success_url: success,

        failure_url: failure,
      },
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  }
}