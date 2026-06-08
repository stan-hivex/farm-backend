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
    currency?: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    payment_method?: string;
    phone?: string;
  }) {
    const callback = data.callback_url ?? this.cfg.get<string>('PAYSTACK_CALLBACK_URL', 'https://app.farm/payment-success');

    const payload: Record<string, unknown> = {
      email: data.email,
      // PAYSTACK USES KOBO/CENTS
      amount: Math.round(data.amount * 100),
      reference: data.reference,
      callback_url: callback,
    };

    if (data.currency) {
      payload.currency = data.currency;
    }
    if (data.metadata) {
      payload.metadata = data.metadata;
    }
    if (data.payment_method) {
      const method = String(data.payment_method).toLowerCase();
      payload.payment_method = method;
      if (method === 'mobile_money') {
        payload.channels = ['mobile_money'];
        if (data.phone) {
          payload.mobile_money = { phone: data.phone };
        }
      }
    }

    try {
      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.secret}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.data?.status) {
        const errorMsg = response.data?.message || 'Paystack API returned unsuccessful status';
        throw new Error(`Paystack initialization failed: ${errorMsg}`);
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Paystack initialization error: ${String(error)}`);
    }
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

  async createTransferRecipient(data: {
    type: 'nuban' | 'mobile_money';
    name: string;
    accountNumber?: string;
    bankCode?: string;
    phone?: string;
    currency?: string;
  }) {
    const payload: Record<string, unknown> = {
      type: data.type,
      name: data.name,
      currency: data.currency ?? 'KES',
    };

    if (data.type === 'nuban') {
      payload['account_number'] = data.accountNumber;
      payload['bank_code'] = data.bankCode;
    }

    if (data.type === 'mobile_money') {
      payload['phone'] = data.phone;
    }

    const response = await axios.post(
      'https://api.paystack.co/transferrecipient',
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data?.status) {
      const errorMsg = response.data?.message || 'Paystack create recipient failed';
      throw new Error(errorMsg);
    }

    return response.data.data;
  }

  async initiateTransfer(data: {
    amount: number;
    recipient: string;
    reference: string;
    reason?: string;
    currency?: string;
  }) {
    const payload: Record<string, unknown> = {
      source: 'balance',
      amount: Math.round(data.amount * 100),
      recipient: data.recipient,
      reference: data.reference,
      reason: data.reason ?? 'Withdrawal payout',
      currency: data.currency ?? 'KES',
    };

    const response = await axios.post(
      'https://api.paystack.co/transfer',
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data?.status) {
      const errorMsg = response.data?.message || 'Paystack initiate transfer failed';
      throw new Error(errorMsg);
    }

    return response.data.data;
  }

  async createTransfer(data: {
    amount: number;
    recipient: string;
    reason: string;
    reference: string;
    currency?: string;
  }) {
    return this.initiateTransfer(data);
  }
}
