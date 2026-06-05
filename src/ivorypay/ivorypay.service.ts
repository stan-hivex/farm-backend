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
    description?: string;
  }) {
    const callback = this.cfg.get<string>('IVORYPAY_CALLBACK_URL', 'https://api.yourdomain.com/api/v1/webhooks/ivorypay');
    const success = this.cfg.get<string>('IVORYPAY_SUCCESS_URL', 'https://app.yourdomain.com/payment-success');
    const failure = this.cfg.get<string>('IVORYPAY_FAILURE_URL', 'https://app.yourdomain.com/payment-failed');

    const payload: Record<string, unknown> = {
      amount: data.amount,
      currency: data.currency,
      reference: data.reference,
      customer: {
        email: data.email,
      },
      callback_url: callback,
      success_url: success,
      failure_url: failure,
    };

    if (data.description) {
      payload.description = data.description;
    }

    const response = await axios.post(
      `${this.baseUrl}/payments`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  }

  async createWithdrawal(data: {
    amount: number;
    currency: string;
    reference: string;
    email: string;
    wallet_address?: string;
    network?: string;
    description?: string;
  }) {
    const payload: Record<string, unknown> = {
      amount: data.amount,
      currency: data.currency,
      reference: data.reference,
      customer: {
        email: data.email,
      },
    };

    // Add crypto-specific fields if present
    if (data.wallet_address) {
      payload.wallet_address = data.wallet_address;
    }
    if (data.network) {
      payload.network = data.network;
    }
    if (data.description) {
      payload.description = data.description;
    }

    const response = await axios.post(
      `${this.baseUrl}/transfers`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data;
  }

  async verifyPayment(reference: string) {
    const response = await axios.get(
      `${this.baseUrl}/payments/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
        },
      },
    );

    return response.data;
  }
}