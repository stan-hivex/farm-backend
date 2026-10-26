import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as QRCode from 'qrcode';

type NowPaymentsRecord = Record<string, any>;

@Injectable()
export class NowpaymentsService {
  private readonly logger = new Logger(NowpaymentsService.name);
  private readonly http: AxiosInstance;
  private payoutToken: string | null = null;
  private payoutTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://api.nowpayments.io/v1',
      timeout: 20_000,
    });
  }

  private getApiKey(): string {
    const key = this.config.get<string>('NOWPAYMENTS_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'NOWPayments is not configured on the server',
      );
    }
    return key;
  }

  private getIpnCallbackUrl(): string {
    const callback = this.config
      .get<string>('NOWPAYMENTS_IPN_CALLBACK_URL')
      ?.trim();
    if (!callback || !/^https:\/\//i.test(callback)) {
      throw new ServiceUnavailableException(
        'A public HTTPS NOWPAYMENTS_IPN_CALLBACK_URL is required',
      );
    }
    return callback;
  }

  private getPayoutIpnCallbackUrl(): string {
    const callback = this.config
      .get<string>('NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL')
      ?.trim();
    if (callback && /^https:\/\//i.test(callback)) return callback;
    if (callback) {
      throw new ServiceUnavailableException(
        'NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL must use HTTPS',
      );
    }
    const paymentCallback = this.getIpnCallbackUrl();
    if (!/\/webhooks\/nowpayments\/?$/.test(paymentCallback)) {
      throw new ServiceUnavailableException(
        'Set NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL to the public payout webhook URL',
      );
    }
    return paymentCallback.replace(
      /\/webhooks\/nowpayments\/?$/,
      '/webhooks/nowpayments-payout',
    );
  }

  private asRecord(value: unknown, operation: string): NowPaymentsRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadGatewayException(
        `NOWPayments returned an invalid response for ${operation}`,
      );
    }
    return value as NowPaymentsRecord;
  }

  private async request<T = unknown>(
    method: 'get' | 'post',
    path: string,
    data?: Record<string, unknown>,
    params?: Record<string, string | number | boolean>,
    headers: Record<string, string> = {},
  ): Promise<T> {
    try {
      const response = await this.http.request<T>({
        method,
        url: path,
        data,
        params,
        headers: {
          'x-api-key': this.getApiKey(),
          ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
      });
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const providerMessage =
          (error.response?.data as any)?.message ??
          (error.response?.data as any)?.status;
        this.logger.error(
          `NOWPayments ${method.toUpperCase()} ${path} failed${status ? ` (HTTP ${status})` : ''}`,
        );
        if (status && status >= 400 && status < 500) {
          throw new BadGatewayException(
            typeof providerMessage === 'string'
              ? `NOWPayments rejected the request: ${providerMessage}`
              : 'NOWPayments rejected the request',
          );
        }
      }
      throw new BadGatewayException(
        'NOWPayments is temporarily unavailable; please try again',
      );
    }
  }

  async getAvailableCurrencies(): Promise<string[]> {
    const response = this.asRecord(
      await this.request('get', '/currencies'),
      'currency list',
    );
    const currencies = response.currencies;
    if (!Array.isArray(currencies)) {
      throw new BadGatewayException(
        'NOWPayments returned an invalid currency list',
      );
    }
    return [...new Set(
      currencies
        .filter((currency): currency is string => typeof currency === 'string')
        .map((currency) => currency.trim().toLowerCase())
        .filter((currency) => /^[a-z0-9]{2,20}$/.test(currency)),
    )].sort();
  }

  async createPayment(input: {
    priceAmount: number;
    priceCurrency: string;
    payCurrency: string;
    orderId: string;
    description: string;
  }) {
    const data = this.asRecord(
      await this.request('post', '/payment', {
        price_amount: input.priceAmount,
        price_currency: input.priceCurrency.toLowerCase(),
        pay_currency: input.payCurrency.toLowerCase(),
        ipn_callback_url: this.getIpnCallbackUrl(),
        order_id: input.orderId,
        order_description: input.description,
      }),
      'payment creation',
    );
    const paymentId = data.payment_id?.toString();
    const address = data.pay_address?.toString();
    const amount = Number(data.pay_amount);
    const currency = data.pay_currency?.toString();
    if (
      !paymentId ||
      !address ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !currency
    ) {
      throw new BadGatewayException(
        'NOWPayments did not return complete payment instructions',
      );
    }
    return {
      ...data,
      payment_id: paymentId,
      pay_address: address,
      pay_amount: amount,
      pay_currency: currency,
      payment_status: data.payment_status?.toString() ?? 'waiting',
      expiration_estimate: data.expiration_estimate ?? null,
      qr_url: await QRCode.toDataURL(address),
    };
  }

  async createInvoice(input: {
    priceAmount: number;
    priceCurrency: string;
    payCurrency: string;
    orderId: string;
    description: string;
    successUrl?: string;
    cancelUrl?: string;
  }) {
    const data = this.asRecord(
      await this.request('post', '/invoice', {
        price_amount: input.priceAmount,
        price_currency: input.priceCurrency.toLowerCase(),
        pay_currency: input.payCurrency.toLowerCase(),
        order_id: input.orderId,
        order_description: input.description,
        ipn_callback_url: this.getIpnCallbackUrl(),
        ...(input.successUrl ? { success_url: input.successUrl } : {}),
        ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
      }),
      'invoice creation',
    );
    const invoiceUrl = data.invoice_url?.toString();
    const invoiceId = data.id?.toString();
    if (!invoiceUrl || !/^https:\/\//i.test(invoiceUrl) || !invoiceId) {
      throw new BadGatewayException(
        'NOWPayments did not return a valid invoice checkout',
      );
    }
    return { ...data, invoice_id: invoiceId, invoice_url: invoiceUrl };
  }

  async getPayment(paymentId: string): Promise<NowPaymentsRecord> {
    if (!/^\d+$/.test(paymentId)) {
      throw new BadGatewayException('Invalid NOWPayments payment ID');
    }
    return this.asRecord(
      await this.request('get', `/payment/${encodeURIComponent(paymentId)}`),
      'payment status check',
    );
  }

  async estimateAmount(
    amount: number,
    currencyFrom: string,
    currencyTo: string,
  ): Promise<number> {
    const response = this.asRecord(
      await this.request('get', '/estimate', undefined, {
        amount,
        currency_from: currencyFrom.toLowerCase(),
        currency_to: currencyTo.toLowerCase(),
      }),
      'payout estimate',
    );
    const estimate = Number(response.estimated_amount);
    if (!Number.isFinite(estimate) || estimate <= 0) {
      throw new BadGatewayException(
        'NOWPayments could not estimate this crypto conversion',
      );
    }
    return estimate;
  }

  async getPayoutMinimum(currency: string): Promise<number> {
    const response = this.asRecord(
      await this.request(
        'get',
        `/payout-withdrawal/min-amount/${encodeURIComponent(currency.toLowerCase())}`,
      ),
      'payout minimum',
    );
    const minimum = Number(response.min_amount ?? response.minimum_amount);
    if (!Number.isFinite(minimum) || minimum <= 0) {
      throw new BadGatewayException(
        'NOWPayments did not return a valid payout minimum',
      );
    }
    return minimum;
  }

  async estimatePayoutFee(currency: string, amount: number): Promise<number> {
    const response = this.asRecord(
      await this.request('get', '/payout/fee', undefined, {
        currency: currency.toUpperCase(),
        amount,
      }),
      'payout network fee estimate',
    );
    const fee = Number(response.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadGatewayException(
        'NOWPayments did not return a valid network fee estimate',
      );
    }
    return fee;
  }

  private async getPayoutToken(): Promise<string> {
    if (this.payoutToken && Date.now() < this.payoutTokenExpiresAt) {
      return this.payoutToken;
    }
    const email = this.config.get<string>('NOWPAYMENTS_EMAIL')?.trim();
    const password = this.config.get<string>('NOWPAYMENTS_PASSWORD');
    if (!email || !password) {
      throw new ServiceUnavailableException(
        'NOWPayments payout credentials are not configured on the server',
      );
    }
    const response = this.asRecord(
      await this.request('post', '/auth', { email, password }),
      'payout authentication',
    );
    const token = response.token?.toString();
    if (!token) {
      throw new BadGatewayException(
        'NOWPayments did not return a payout authentication token',
      );
    }
    this.payoutToken = token;
    this.payoutTokenExpiresAt = Date.now() + 4 * 60 * 1000;
    return token;
  }

  private async payoutRequest<T = unknown>(
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getPayoutToken();
    return this.request<T>(method, path, body, undefined, {
      Authorization: `Bearer ${token}`,
    });
  }

  async createPayout(input: {
    address: string;
    currency: string;
    amount: number;
    reference: string;
  }): Promise<NowPaymentsRecord> {
    return this.asRecord(
      await this.payoutRequest('post', '/payout', {
        ipn_callback_url: this.getPayoutIpnCallbackUrl(),
        withdrawals: [
          {
            address: input.address,
            currency: input.currency.toLowerCase(),
            amount: input.amount,
            ipn_callback_url: this.getPayoutIpnCallbackUrl(),
            payout_description: `FARM crypto withdrawal ${input.reference}`,
            unique_external_id: input.reference,
          },
        ],
      }),
      'payout creation',
    );
  }

  async verifyPayout(payoutId: string, verificationCode: string) {
    return this.asRecord(
      await this.payoutRequest(
        'post',
        `/payout/${encodeURIComponent(payoutId)}/verify`,
        { verification_code: verificationCode },
      ),
      'payout verification',
    );
  }

  async getPayout(payoutId: string) {
    return this.asRecord(
      await this.payoutRequest(
        'get',
        `/payout/${encodeURIComponent(payoutId)}`,
      ),
      'payout status check',
    );
  }
}
