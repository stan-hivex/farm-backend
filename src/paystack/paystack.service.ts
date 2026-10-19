import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  getBankCode,
  normalizeKenyanPhoneNumber,
  type KenyanBankEnvironment,
} from './ke-bank-mapper';

export class PaystackTransferInitiationError extends Error {
  constructor(
    message: string,
    readonly outcome: 'rejected' | 'unknown',
  ) {
    super(message);
    this.name = PaystackTransferInitiationError.name;
  }
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secretKey: string | undefined;
  private readonly paystackBaseUrl = 'https://api.paystack.co';
  private readonly bankCodeMap: Record<string, Record<string, string>>;
  private readonly kenyaBankCodeFallback: Record<string, string> = {
    'i&m': 'IM',
    im: 'IM',
    imbank: 'IM',
    iandm: 'IM',
    iandmbank: 'IM',
    'co-operativebank': 'COOP',
    cooperativebank: 'COOP',
    'cooperative bank': 'COOP',
    equity: 'EQB',
    kcb: 'KCB',
    'kenya commercial bank': 'KCB',
    stanbic: 'SBK',
    barclays: 'BAR',
    'barclays bank': 'BAR',
    standardchartered: 'SCB',
    'standard chartered': 'SCB',
    scbk: 'SCB',
    absa: 'ABSA',
    fnb: 'FNB',
    dfcu: 'DFCU',
    ncb: 'NCB',
    ncba: 'NCB',
    familybank: 'FBP',
    'family bank': 'FBP',
    spencer: 'SCBK',
    postbank: 'POSTA',
    stanchart: 'SCB',
    icbd: 'ICBD',
    'diamond trust bank': 'DTB',
    dtb: 'DTB',
    swift: 'SWIFT',
  };

  constructor(private cfg: ConfigService) {
    this.secretKey = this.cfg.get<string>('PAYSTACK_SECRET_KEY');
    const rawBankMap = this.cfg.get<string>('PAYSTACK_BANK_CODE_MAP');
    if (rawBankMap) {
      try {
        this.bankCodeMap = JSON.parse(rawBankMap);
      } catch (e) {
        this.logger.warn(
          'PAYSTACK_BANK_CODE_MAP is not valid JSON. Ignoring configured bank mapping.',
        );
        this.bankCodeMap = {};
      }
    } else {
      this.bankCodeMap = {};
    }
  }

  private getKenyanBankEnvironment(): KenyanBankEnvironment {
    return {
      KE: this.cfg.get<string>('KE') ?? process.env.KE,
      KE_BANKS: this.cfg.get<string>('KE_BANKS') ?? process.env.KE_BANKS,
      BANK_CODES: this.cfg.get<string>('BANK_CODES') ?? process.env.BANK_CODES,
      PAYSTACK_BANK_CODE_MAP:
        this.cfg.get<string>('PAYSTACK_BANK_CODE_MAP') ??
        process.env.PAYSTACK_BANK_CODE_MAP,
    };
  }

  async initializePayment(options: any) {
    if (!this.secretKey) {
      this.logger.warn(
        'PAYSTACK_SECRET_KEY not configured, returning mock response',
      );
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
          `amount=${options.amount}`,
      );

      const requestBody: any = {
        email: options.email,
        amount: this.toPaystackAmount(options.amount),
        reference: options.reference,
        ...(options.channels && { channels: options.channels }),
        ...(options.phone && { phone: options.phone }),
        ...(options.metadata && { metadata: options.metadata }),
        ...(options.callback_url && { callback_url: options.callback_url }),
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
        this.logger.error(
          'Paystack initialized with invalid response body',
          response.data,
        );
        throw new BadRequestException('Invalid Paystack response');
      }

      this.logger.log(
        `Paystack: initialized ${options.reference}, auth_url=${response.data.data.authorization_url}`,
      );
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
        this.logger.debug(
          `Paystack initialize error details: ${JSON.stringify(apiData)}`,
        );
      }

      // Provide a clearer error when the merchant hasn't enabled the requested channel.
      if (
        apiData?.code === 'invalid_params' &&
        typeof message === 'string' &&
        message.toLowerCase().includes('no active channel')
      ) {
        const nextStep =
          apiData?.meta?.nextStep ||
          'Please enable the required channel in your Paystack dashboard or contact Paystack support.';
        const channelHint = options.channels?.some(
          (channel: string) => channel === 'bank' || channel === 'bank_transfer',
        )
          ? 'The Paystack bank channel (including Pesalink) is not enabled for this account. Enable it in Paystack or contact Paystack support.'
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
      this.logger.warn(
        'PAYSTACK_SECRET_KEY not configured, returning mock verify',
      );
      return { status: 'success', reference };
    }

    try {
      this.logger.log(`Paystack: verifying transaction ${reference}`);
      const response = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException('Transaction verification failed');
      }

      this.logger.log(
        `Paystack: verified ${reference}, status=${response.data.data?.status}`,
      );
      return response.data.data;
    } catch (e: any) {
      this.logger.error(
        `Paystack verify error: ${e.response?.data?.message || e.message}`,
      );
      throw new BadRequestException(
        `Paystack verification failed: ${e.response?.data?.message || e.message}`,
      );
    }
  }

  async createTransferRecipient(payload: any) {
    if (!this.secretKey) {
      throw new BadRequestException('Paystack payouts are not configured');
    }

    const requestPayload = { ...payload };
    if (String(payload.currency ?? '').toUpperCase() === 'KES') {
      const recipientType = String(payload.type ?? '').toLowerCase();
      if (!['kepss', 'mobile_money'].includes(recipientType)) {
        throw new BadRequestException(
          'Kenyan Paystack recipients must use kepss for bank accounts or mobile_money for M-Pesa.',
        );
      }
      const rawInput =
        payload.bankName ??
        payload.bankCode ??
        payload.bank_name ??
        payload.bank_code;
      let code = String(payload.bank_code ?? payload.bankCode ?? '').trim();
      if (!code && recipientType === 'kepss') {
        code = await this.getBankCodeByName(String(rawInput ?? ''));
      }
      if (!code && recipientType === 'mobile_money') code = 'MPESA';
      if (!code) {
        throw new BadRequestException(
          `Invalid Kenyan bank: ${String(rawInput ?? '')}`,
        );
      }

      requestPayload.bank_code = code;
      delete requestPayload.bankName;
      delete requestPayload.bankCode;
      delete requestPayload.bank_name;
      if (recipientType === 'mobile_money' && requestPayload.account_number) {
        requestPayload.account_number = normalizeKenyanPhoneNumber(
          String(requestPayload.account_number),
        );
      }
    }

    try {
      this.logger.debug(
        `Paystack transfer recipient request: ${JSON.stringify({
          type: requestPayload.type,
          currency: requestPayload.currency,
          bank_code: requestPayload.bank_code,
          account_number: requestPayload.account_number
            ? `***${String(requestPayload.account_number).slice(-4)}`
            : undefined,
        })}`,
      );
      const response = await axios.post(
        `${this.paystackBaseUrl}/transferrecipient`,
        requestPayload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException('Failed to create transfer recipient');
      }

      this.logger.debug(
        `Paystack transfer recipient created: type=${response.data.data?.type}, code=${response.data.data?.recipient_code}`,
      );
      return response.data.data;
    } catch (e: any) {
      const responseData = e.response?.data;
      const apiMessage = responseData?.message || e.message;
      this.logger.error(`Paystack recipient creation error: ${apiMessage}`);
      if (responseData) {
        this.logger.debug(
          `Paystack recipient creation error code: ${responseData.code || 'unspecified'}`,
        );
      }

      // Provide actionable guidance for common bank code problems
      if (
        responseData?.code === 'invalid_bank_code' ||
        (typeof apiMessage === 'string' &&
          apiMessage.toLowerCase().includes('bank is invalid'))
      ) {
        const hintParts = [
          `Paystack rejected the bank code for '${payload?.bank_name || payload?.name || ''}'.`,
          "Use a current KES bank code from Paystack's Kenya bank list.",
          'Fetch destinations with currency=KES, country=kenya, and use_kenya_code=true, then select the bank again.',
        ];

        throw new BadRequestException(
          `Paystack recipient failed: ${apiMessage}. ${hintParts.join(' ')}`,
        );
      }

      throw new BadRequestException(`Paystack recipient failed: ${apiMessage}`);
    }
  }

  // Fetch Paystack supported banks for a country and attempt to match a bank name
  private banksCache: Record<string, any[]> = {};

  async getBanks(currency = 'KES', type?: string) {
    const normalizedCurrency = currency.trim().toUpperCase();
    const normalizedType = type?.trim().toLowerCase();
    if (!this.secretKey) {
      throw new BadRequestException('Paystack payouts are not configured');
    }

    const cacheKey = `${normalizedCurrency}:${normalizedType ?? 'all'}`;
    if (this.banksCache[cacheKey]) return this.banksCache[cacheKey];

    try {
      const response = await axios.get(`${this.paystackBaseUrl}/bank`, {
        params: {
          currency: normalizedCurrency,
          ...(normalizedCurrency === 'KES'
            ? { country: 'kenya', use_kenya_code: true }
            : {}),
          ...(normalizedType ? { type: normalizedType } : {}),
        },
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });
      if (!response.data?.status || !Array.isArray(response.data.data)) {
        throw new BadRequestException(
          'Paystack returned an invalid payout destination list',
        );
      }
      const destinations = response.data.data
        .filter((entry: any) => entry?.active !== false)
        .map((entry: any) => {
          const bankCode = entry?.bank_code ?? entry?.code;
          return {
            ...entry,
            code: bankCode == null ? '' : String(bankCode),
            bank_code: bankCode == null ? '' : String(bankCode),
            type: entry?.type ?? normalizedType,
            currency: entry?.currency ?? normalizedCurrency,
          };
        })
        .filter((entry: any) => entry.name && entry.code);
      if (destinations.length > 0) {
        this.banksCache[cacheKey] = destinations;
      }
      return destinations;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch Paystack destinations for ${normalizedCurrency}: ${error.response?.data?.message || error.message}`,
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Could not load Paystack payout destinations: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async getBankCodeByName(bankName: string, country = 'KE') {
    const key = country.toUpperCase();
    if (key === 'KE') {
      const banks = await this.getBanks('KES', 'kepss');
      const normalized = this.normalizeBankName(bankName);
      const exactMatch = banks.find(
        (bank: any) =>
          this.normalizeBankName(bank.name ?? '') === normalized ||
          this.normalizeBankName(bank.slug ?? '') === normalized,
      );
      if (exactMatch?.bank_code) return exactMatch.bank_code;

      const matchingCodes = new Set(
        banks
          .filter((bank: any) => {
            const name = this.normalizeBankName(bank.name ?? '');
            const slug = this.normalizeBankName(bank.slug ?? '');
            return (
              normalized.length >= 3 &&
              (name.includes(normalized) ||
                normalized.includes(name) ||
                slug.includes(normalized) ||
                normalized.includes(slug))
            );
          })
          .map((bank: any) => bank.bank_code)
          .map((bankCode: unknown) => String(bankCode ?? ''))
          .filter(Boolean),
      );
      if (matchingCodes.size === 1) return [...matchingCodes][0];
      throw new BadRequestException(
        `Invalid or ambiguous Kenyan bank: ${bankName}. Refresh the bank list and select a supported bank.`,
      );
    }

    const banks = await this.getBanks(key);
    const normalized = this.normalizeBankName(bankName);
    const match = banks.find(
      (bank: any) => this.normalizeBankName(bank?.name ?? '') === normalized,
    );
    if (match?.code) return match.code;

    throw new BadRequestException(
      `Unknown Paystack bank '${bankName}'. Refresh the bank list and select a supported bank.`,
    );
  }

  private async legacyGetBankCodeByName(bankName: string, country = 'KE') {
    if (!this.secretKey) {
      // In non-production/testing without keys, return the provided value
      return bankName;
    }

    const key = country.toUpperCase();
    if (!this.banksCache[key]) {
      try {
        const resp = await axios.get(
          `${this.paystackBaseUrl}/bank?country=${country}`,
          {
            headers: { Authorization: `Bearer ${this.secretKey}` },
          },
        );
        this.banksCache[key] = resp.data.data || [];
        this.logger.debug(
          `Paystack bank list for ${country}: ${JSON.stringify(this.banksCache[key].slice(0, 5))}`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to fetch Paystack banks for ${country}: ${e?.message || e}`,
        );
        if (e.response?.data) {
          this.logger.debug(
            `Paystack banks error data: ${JSON.stringify(e.response.data)}`,
          );
        }
        this.banksCache[key] = [];
      }
    }

    const banks = this.banksCache[key] || [];
    const configuredMap = this.bankCodeMap[key] || {};
    const normalized = this.normalizeBankName(bankName);

    if (!banks.length) {
      if (configuredMap[normalized]) {
        this.logger.log(
          `Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`,
        );
        return configuredMap[normalized];
      }

      if (
        country.toUpperCase() === 'KE' &&
        this.kenyaBankCodeFallback[normalized]
      ) {
        this.logger.log(
          `Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`,
        );
        return this.kenyaBankCodeFallback[normalized];
      }

      const message =
        country.toUpperCase() === 'KE'
          ? `Paystack bank code not available for '${bankName}' in Kenya. Configure PAYSTACK_BANK_CODE_MAP for Kenyan bank name → bank_code mappings or use MOBILE_MONEY/CRYPTO instead.`
          : `No Paystack bank list available for ${country}. Please verify the Paystack configuration and supported countries.`;
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    // Try exact match first
    for (const b of banks) {
      if (
        (b.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
      ) {
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
      this.logger.log(
        `Bank code resolved from configured map for '${bankName}' -> '${configuredMap[normalized]}'`,
      );
      return configuredMap[normalized];
    }

    if (
      country.toUpperCase() === 'KE' &&
      this.kenyaBankCodeFallback[normalized]
    ) {
      this.logger.log(
        `Bank code resolved from built-in Kenya fallback for '${bankName}' -> '${this.kenyaBankCodeFallback[normalized]}'`,
      );
      return this.kenyaBankCodeFallback[normalized];
    }

    const sample = banks
      .slice(0, 8)
      .map((b: any) => `${b.name} (${b.code})`)
      .join(', ');
    throw new BadRequestException(
      `Unknown bank name '${bankName}'. Paystack supported examples: ${sample}`,
    );
  }

  private normalizeBankName(bankName: string) {
    return (bankName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toPaystackAmount(amount: number | string) {
    const value = Number(amount);
    if (Number.isNaN(value)) {
      throw new BadRequestException(
        'Invalid amount for Paystack initialization',
      );
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
      throw new BadRequestException('Paystack payouts are not configured');
    }

    try {
      const transferPayload: any = {
        ...payload,
        amount: this.toPaystackAmount(payload.amount),
      };

      // If caller provided a phone_number, include recipient_phone for SMS routing
      if (payload.phone_number) {
        transferPayload.recipient_phone = this.formatPhoneForPaystack(
          payload.phone_number,
        );
      }

      this.logger.debug(
        `Paystack transfer payload: ${JSON.stringify({
          recipient: transferPayload.recipient,
          amount: transferPayload.amount,
          currency: transferPayload.currency,
          reference: transferPayload.reference,
          recipient_phone: transferPayload.recipient_phone
            ? `***${String(transferPayload.recipient_phone).slice(-4)}`
            : undefined,
        })}`,
      );

      const response = await axios.post(
        `${this.paystackBaseUrl}/transfer`,
        transferPayload,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new PaystackTransferInitiationError(
          response.data.message || 'Paystack rejected the transfer',
          'rejected',
        );
      }

      this.logger.debug(
        `Paystack transfer initiated: status=${response.data.data?.status}, code=${response.data.data?.transfer_code}, reference=${response.data.data?.reference}`,
      );
      return response.data;
    } catch (e: any) {
      if (e instanceof PaystackTransferInitiationError) throw e;

      const apiMessage = e.response?.data?.message || e.message;
      const statusCode = Number(e.response?.status);
      const duplicateReference =
        /reference.{0,30}(already|exist|used|duplicate)|(already|duplicate).{0,30}reference/i.test(
          String(apiMessage),
        );
      const outcome =
        !e.response ||
        statusCode >= 500 ||
        statusCode === 409 ||
        duplicateReference
          ? 'unknown'
          : 'rejected';
      this.logger.error(
        `Paystack transfer error: outcome=${outcome} status=${statusCode || 'no response'} message=${apiMessage}`,
      );
      throw new PaystackTransferInitiationError(
        `Paystack transfer ${outcome === 'unknown' ? 'outcome is unknown' : 'failed'}: ${apiMessage}`,
        outcome,
      );
    }
  }

  async getTransferStatus(transferCode: string) {
    if (!this.secretKey) {
      throw new BadRequestException('Paystack payouts are not configured');
    }

    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/transfer/${encodeURIComponent(transferCode)}`,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException(
          'Failed to retrieve transfer status from Paystack',
        );
      }

      this.logger.log(`Paystack transfer status fetched for ${transferCode}`);
      return response.data.data;
    } catch (e: any) {
      this.logger.error(
        `Paystack transfer status error: ${e.response?.data?.message || e.message}`,
      );
      throw new BadRequestException(
        `Paystack transfer status lookup failed: ${e.response?.data?.message || e.message}`,
      );
    }
  }

  async getTransferByReference(reference: string) {
    if (!this.secretKey) {
      throw new BadRequestException('Paystack payouts are not configured');
    }

    try {
      const response = await axios.get(
        `${this.paystackBaseUrl}/transfer/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: 'Bearer ' + this.secretKey },
        },
      );
      if (!response.data?.status || !response.data?.data) {
        throw new BadRequestException(
          'Paystack did not return a transfer for this reference',
        );
      }
      return response.data.data;
    } catch (e: any) {
      this.logger.error(
        `Paystack transfer reference lookup error: ${e.response?.data?.message || e.message}`,
      );
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        `Paystack transfer reference lookup failed: ${e.response?.data?.message || e.message}`,
      );
    }
  }
}
