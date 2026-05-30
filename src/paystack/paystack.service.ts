import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly secret: string;

  constructor(private cfg: ConfigService) {
    this.secret = this.cfg.get<string>('PAYSTACK_SECRET_KEY') || process.env.PAYSTACK_SECRET_KEY || '';
  }

  async initializePayment(data: {
    email: string;
    amount: number;
    reference: string;
  }) {
    const callback = this.cfg.get<string>('PAYSTACK_CALLBACK_URL', 'https://app.farm/payment-success');

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: data.email,

        // PAYSTACK USES KOBO/CENTS
        amount: Math.round(data.amount * 100),

        reference: data.reference,

        callback_url: callback,
      },
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.data;
  }

  async verifyTransaction(reference: string) {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
        },
      },
    );

    return response.data.data;
  }
}