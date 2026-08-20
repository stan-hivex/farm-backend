import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class StkPushService {
  private readonly logger = new Logger(StkPushService.name);
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortCode: string;
  private readonly passKey: string;
  private readonly callbackUrl: string;
  private readonly transactionType: string;
  private readonly enabled: boolean;

  constructor(private cfg: ConfigService) {
    this.baseUrl = this.cfg.get<string>('STK_PUSH_BASE_URL', 'https://sandbox.safaricom.co.ke');
    this.consumerKey = this.cfg.get<string>('STK_PUSH_CONSUMER_KEY') || '';
    this.consumerSecret = this.cfg.get<string>('STK_PUSH_CONSUMER_SECRET') || '';
    this.shortCode = this.cfg.get<string>('STK_PUSH_SHORTCODE') || '';
    this.passKey = this.cfg.get<string>('STK_PUSH_PASSKEY') || '';
    this.callbackUrl = this.cfg.get<string>('STK_PUSH_CALLBACK_URL', 'https://app.farm/webhooks/stk-push');
    this.transactionType = this.cfg.get<string>('STK_PUSH_TRANSACTION_TYPE', 'CustomerPayBillOnline');
    this.enabled = this.cfg.get<string>('STK_PUSH_ENABLED', 'false').toLowerCase() === 'true';

    if (this.enabled && (!this.consumerKey || !this.consumerSecret || !this.shortCode || !this.passKey)) {
      this.logger.warn('STK push provider is enabled but not fully configured. Make sure STK_PUSH_* config values are set.');
    }
  }

  private formatPhone(phone: string): string {
    const candidate = String(phone || '').trim().replace(/[^0-9]/g, '');
    if (!candidate) {
      throw new BadRequestException('Phone number is required for STK push');
    }

    if (candidate.startsWith('0')) {
      return `254${candidate.slice(1)}`;
    }

    if (candidate.startsWith('7') && candidate.length === 9) {
      return `254${candidate}`;
    }

    if (candidate.startsWith('254') && candidate.length === 12) {
      return candidate;
    }

    throw new BadRequestException('STK push phone number must be a Kenyan number starting with 254 or 0');
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  }

  private formatPassword(timestamp: string): string {
    return Buffer.from(`${this.shortCode}${this.passKey}${timestamp}`).toString('base64');
  }

  private async getAccessToken(): Promise<string> {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new BadRequestException('Missing STK push credentials');
    }

    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const token = response.data?.access_token;
    if (!token) {
      throw new BadRequestException('Unable to obtain STK push access token');
    }

    return token;
  }

  async initiatePush(data: {
    phone: string;
    amount: number;
    reference: string;
    accountReference?: string;
    description?: string;
  }) {
    if (!this.enabled || !this.consumerKey || !this.consumerSecret || !this.shortCode || !this.passKey) {
      throw new BadRequestException('STK push is not configured for this environment. Set STK_PUSH_ENABLED=true and the required STK_PUSH_* values.');
    }

    const phoneNumber = this.formatPhone(data.phone);
    const timestamp = this.formatTimestamp();
    const password = this.formatPassword(timestamp);
    const accessToken = await this.getAccessToken();

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: this.transactionType,
      Amount: Math.round(data.amount),
      PartyA: phoneNumber,
      PartyB: this.shortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: this.callbackUrl,
      AccountReference: data.accountReference || data.reference,
      TransactionDesc: data.description || `Deposit request ${data.reference}`,
    };

    const response = await axios.post(
      `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data) {
      throw new BadRequestException('Empty STK push response');
    }

    return response.data;
  }
}
