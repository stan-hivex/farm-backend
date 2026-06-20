import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string | undefined;
  private readonly paystackBaseUrl = 'https://api.paystack.co';
  private readonly bankCodeMap: Record<string, Record<string, string>>;
  private readonly kenyaBankCodeFallback: Record<string, string> = {
    'i&m': 'IM',
    'im': 'IM',
    'co-operativebank': 'COOP',
    'cooperativebank': 'COOP',
    'cooperative bank': 'COOP',
    'equity': 'EQB',
    'kcb': 'KCB',
    'stanbic': 'SBK',
    'barclays': 'BAR',
    'barclays bank': 'BAR',
    'scbk': 'SCB',
    'standardchartered': 'SCB',
    'standard chartered': 'SCB',
    'absa': 'ABSA',
    'fnb': 'FNB',
    'dfcu': 'DFCU',
    'ncb': 'NCB',
    'familybank': 'FBP',
    'family bank': 'FBP',
    'spencer': 'SCBK',
  };

  constructor(private cfg: ConfigService) {
    this.secretKey = this.cfg.get<string>('PAYSTACK_SECRET_KEY');
    const rawBankMap = this.cfg.get<string>('PAYSTACK_BANK_CODE_MAP');
    if (rawBankMap) {
      try {
        this.bankCodeMap = JSON.parse(rawBankMap);
      } catch (e) {
        this.logger.warn('PAYSTACK_BANK_CODE_MAP is not valid JSON. Ignoring configured bank mapping.');
        this.bankCodeMap = {};
      }
    } else {
      this.bankCodeMap = {};
    }
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
      this.logger.log(
        `Paystack: initializing transaction for ${options.reference} | ` +
        `channels=${JSON.stringify(options.channels)} | ` +
        `phone=${options.phone || 'N/A'} | ` +
        `currency=${options.currency || 'N/A'} | ` +
        `amount=${options.amount}`
      );

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
      const apiData = e.response?.data;
      const message = apiData?.message || e.message;
      this.logger.error(`Paystack initialize error: ${message}`);
      if (apiData) {
        this.logger.debug(`Paystack initialize error details: ${JSON.stringify(apiData)}`);
      }

      // Provide a clearer error when the merchant hasn't enabled the requested channel.
      if (apiData?.code === 'invalid_params' && typeof message === 'string' && message.toLowerCase().includes('no active channel')) {
        const nextStep = apiData?.meta?.nextStep || 'Please enable the required channel in your Paystack dashboard or contact Paystack support.';
        const channelHint = options.channels?.includes('bank')
          ? 'Bank transfers are not enabled for this Paystack account. Enable bank transfer support in Paystack or use CARD instead.'
          : 'Please verify your Paystack channel configuration for the requested payment method.';

        throw new BadRequestException(
          `Paystack channel unavailable: ${message}. ${channelHint} ${nextStep}`,
        );
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
      this.logger.debug(`Paystack transfer recipient payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(
        `${this.paystackBaseUrl}/transferrecipient`,
        payload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      this.logger.debug(`Paystack transfer recipient response: ${JSON.stringify(response.data)}`);
      if (!response.data.status) {
        throw new BadRequestException('Failed to create transfer recipient');
      }

      return response.data.data;
    } catch (e: any) {
      const responseData = e.response?.data;
      this.logger.error(`Paystack recipient creation error: ${responseData?.message || e.message}`);
      if (responseData) {
        this.logger.debug(`Paystack recipient creation error payload: ${JSON.stringify(responseData)}`);
      }
      throw new BadRequestException(`Paystack recipient failed: ${responseData?.message || e.message}`);
    }
  }

  // Fetch Paystack supported banks for a country and attempt to match a bank name
  private banksCache: Record<string, any[]> = {};

  async getBankCodeByName(bankName: string, country = 'KE') {
    if (!this.secretKey) {
      // In non-production/testing without keys, return the provided value
      return bankName;
    }

    const key = country.toUpperCase();
    if (!this.banksCache[key]) {
      try {
        const resp = await axios.get(`${this.paystackBaseUrl}/bank?country=${country}`, {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        });
        this.banksCache[key] = resp.data.data || [];
        this.logger.debug(`Paystack bank list for ${country}: ${JSON.stringify(this.banksCache[key].slice(0, 5))}`);
      } catch (e: any) {
        this.logger.error(`Failed to fetch Paystack banks for ${country}: ${e?.message || e}`);
        if (e.response?.data) {
          this.logger.debug(`Paystack banks error data: ${JSON.stringify(e.response.data)}`);
        }
        this.banksCache[key] = [];
      }
    }

    const banks = this.banksCache[key] || [];
    const configuredMap = this.bankCodeMap[key] || {};
    const normalized = this.normalizeBankName(bankName);

    if (!banks.length) {
      if (configuredMap[normalized]) {
        this.logger.log(`Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`);
        return configuredMap[normalized];
      }

      if (country.toUpperCase() === 'KE' && this.kenyaBankCodeFallback[normalized]) {
        this.logger.log(`Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`);
        return this.kenyaBankCodeFallback[normalized];
      }

      const message = country.toUpperCase() === 'KE'
        ? `Paystack bank code not available for '${bankName}' in Kenya. Configure PAYSTACK_BANK_CODE_MAP for Kenyan bank name → bank_code mappings or use MOBILE_MONEY/CRYPTO instead.`
        : `No Paystack bank list available for ${country}. Please verify the Paystack configuration and supported countries.`;
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    // Try exact match first
    for (const b of banks) {
      if ((b.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) {
        return b.code;
      }
    }

    // Try contains match
    for (const b of banks) {
      if ((b.name || '').toLowerCase().includes(bankName.toLowerCase())) {
        return b.code;
      }
    }

    if (configuredMap[normalized]) {
      this.logger.log(`Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`);
      return configuredMap[normalized];
    }

    if (country.toUpperCase() === 'KE' && this.kenyaBankCodeFallback[normalized]) {
      this.logger.log(`Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`);
      return this.kenyaBankCodeFallback[normalized];
    }

    const sample = banks.slice(0, 8).map((b: any) => `${b.name} (${b.code})`).join(', ');
    throw new BadRequestException(`Unknown bank name '${bankName}'. Paystack supported examples: ${sample}`);
  }

  private normalizeBankName(bankName: string) {
    return (bankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toPaystackAmount(amount: number | string) {
    const value = Number(amount);
    if (Number.isNaN(value)) {
      throw new BadRequestException('Invalid amount for Paystack initialization');
    }
    return Math.round(value * 100);
  }

  private formatPhoneForPaystack(phone: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/[^\d]/g, '');
    if (digits.startsWith('254')) return '+' + digits;
    if (digits.startsWith('0')) return '+254' + digits.substring(1);
    if (digits.length >= 9 && !digits.startsWith('+')) return '+' + digits;
    return phone;
  }

  async initiateTransfer(payload: any) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock transfer');
      return { status: 'success', data: { id: 'TRF_MOCK_123456' } };
    }

    try {
      const transferPayload: any = {
        ...payload,
        amount: this.toPaystackAmount(payload.amount),
      };

      // If caller provided a phone_number, include recipient_phone for SMS routing
      if (payload.phone_number) {
        transferPayload.recipient_phone = this.formatPhoneForPaystack(payload.phone_number);
      }

      this.logger.debug(`Paystack transfer payload: ${JSON.stringify({
        recipient: transferPayload.recipient,
        amount: transferPayload.amount,
        currency: transferPayload.currency,
        reference: transferPayload.reference,
        recipient_phone: transferPayload.recipient_phone,
      })}`);

      const response = await axios.post(
        `${this.paystackBaseUrl}/transfer`,
        transferPayload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      this.logger.debug(`Paystack transfer response: ${JSON.stringify(response.data)}`);

      if (!response.data.status) {
        throw new BadRequestException('Failed to initiate transfer');
      }

      return response.data;
    } catch (e: any) {
      this.logger.error(`Paystack transfer error: ${e.response?.data?.message || e.message}`);
      throw new BadRequestException(`Paystack transfer failed: ${e.response?.data?.message || e.message}`);
    }
  }

  async getTransferStatus(transferCode: string) {
    if (!this.secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY not configured, returning mock transfer status');
      return { transfer_code: transferCode, status: 'success' };
    }

    try {
      const response = await axios.get(`${this.paystackBaseUrl}/transfer/${encodeURIComponent(transferCode)}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      if (!response.data.status) {
        throw new BadRequestException('Failed to retrieve transfer status from Paystack');
      }

      this.logger.log(`Paystack transfer status fetched for ${transferCode}`);
      return response.data.data;
    } catch (e: any) {
      this.logger.error(`Paystack transfer status error: ${e.response?.data?.message || e.message}`);
      throw new BadRequestException(`Paystack transfer status lookup failed: ${e.response?.data?.message || e.message}`);
    }
  }
}
