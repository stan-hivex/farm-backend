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

  private extractProviderIdentifiers(data: any) {
    const identifiers: Record<string, any> = {
      transaction_id: null,
      payment_id: null,
      checkout_id: null,
      provider_reference: null,
      tx_ref: null,
      trxref: null,
      transaction_reference: null,
      reference: null,
      id: null,
    };

    const keys = new Set<string>();

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchKey = (key: string) => {
      const normalized = normalizeKey(key);
      if (normalized === 'transactionid' || normalized === 'transactionid' || normalized === 'txnid') return 'transaction_id';
      if (normalized === 'paymentid') return 'payment_id';
      if (normalized === 'checkoutid') return 'checkout_id';
      if (normalized === 'providerreference') return 'provider_reference';
      if (normalized === 'txref' || normalized === 'tx_ref') return 'tx_ref';
      if (normalized === 'trxref' || normalized === 'trx_ref') return 'trxref';
      if (normalized === 'transactionreference') return 'transaction_reference';
      if (normalized === 'reference') return 'reference';
      if (normalized === 'id') return 'id';
      return null;
    };

    const scan = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        const mapped = matchKey(key);
        if (mapped && identifiers[mapped] == null && value != null && value !== '') {
          identifiers[mapped] = value;
          keys.add(mapped);
        }
        if (typeof value === 'object' && value !== null) {
          scan(value);
        }
      }
    };

    scan(data);
    return identifiers;
  }

  private determinePrimaryProviderReference(identifiers: Record<string, any>) {
    return (
      identifiers.transaction_id ||
      identifiers.id ||
      identifiers.provider_reference ||
      identifiers.tx_ref ||
      identifiers.trxref ||
      identifiers.transaction_reference ||
      identifiers.payment_id ||
      identifiers.checkout_id ||
      null
    );
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

      const providerIdentifiers = this.extractProviderIdentifiers(data);
      const providerReference = this.determinePrimaryProviderReference(providerIdentifiers);

      this.logger.log(
        `Ivorypay createPayment success: internalReference=${options.reference} providerTransactionId=${providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? 'n/a'} ` +
        `checkoutId=${providerIdentifiers.checkout_id ?? 'n/a'} paymentId=${providerIdentifiers.payment_id ?? 'n/a'} providerReference=${providerReference ?? 'n/a'}`,
      );

      return {
        data,
        payment_link: paymentLink,
        checkout_url: paymentLink,
        providerReference,
        providerIdentifiers,
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

  async verifyTransaction(reference: string, providerReference?: string, fallbackReferences: string[] = []) {
    if (!this.apiKey) {
      this.logger.warn('IVORYPAY_API_KEY not configured, returning mock verify');
      return { status: 'completed', reference };
    }

    const candidates = [
      providerReference?.toString()?.trim(),
      ...fallbackReferences.map((id) => id?.toString()?.trim()),
    ]
      .filter((id): id is string => !!id)
      .map((id) => id.trim())
      .filter((value, index, self) => self.indexOf(value) === index);

    if (!candidates.includes(reference)) {
      candidates.push(reference);
    }

    let lastError: any = null;
    for (const lookupReference of candidates) {
      const verifyUrl = `${this.baseUrl}/v1/transactions/${encodeURIComponent(lookupReference)}`;
      try {
        this.logger.log(`Ivorypay: verifying transaction ${lookupReference} (internal reference=${reference}) via ${verifyUrl}`);
        const response = await axios.get(verifyUrl,
          {
            headers: {
              Authorization: `${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!response.data || response.data.success === false) {
          const message = response.data?.message || response.data?.error || 'Ivorypay verification failed';
          if (response.data?.statusCode === 404 || response.status === 404) {
            this.logger.warn(`Ivorypay verify returned 404 for ${lookupReference}; trying alternate references if available`);
            lastError = new Error(message);
            continue;
          }
          throw new BadRequestException(`Ivorypay verification failed: ${message}`);
        }

        const verifiedData = response.data.data ?? response.data;
        const status = verifiedData?.status ?? response.data?.status;
        if (!status) {
          this.logger.warn(`Ivorypay verify response for ${lookupReference} missing status field: ${JSON.stringify(response.data)}`);
          throw new BadRequestException('Ivorypay verification failed: missing status field');
        }

        const providerIdentifiers = this.extractProviderIdentifiers(verifiedData);
        verifiedData.providerIdentifiers = providerIdentifiers;
        verifiedData.providerReference = lookupReference;
        verifiedData.reference = verifiedData.reference ?? reference;

        this.logger.log(
          `Ivorypay: verified transaction ${lookupReference} (internalReference=${reference}) status=${status} ` +
          `providerTransactionId=${providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? 'n/a'} checkoutId=${providerIdentifiers.checkout_id ?? 'n/a'} paymentId=${providerIdentifiers.payment_id ?? 'n/a'} providerReference=${providerIdentifiers.provider_reference ?? 'n/a'}`,
        );

        return verifiedData;
      } catch (e: any) {
        const message = e.response?.data?.message || e.response?.data?.error || e.message;
        this.logger.error(`Ivorypay verify error for ${lookupReference}: ${message}`);
        if (e.response?.data) {
          this.logger.debug(`Ivorypay verify response body: ${JSON.stringify(e.response.data)}`);
        }

        if (e.response?.status === 404 || e.response?.data?.statusCode === 404) {
          lastError = e;
          continue;
        }

        throw new BadRequestException(`Ivorypay verification failed: ${message}`);
      }
    }

    const finalMessage = lastError?.response?.data?.message || lastError?.message || 'Ivorypay verification failed';
    throw new BadRequestException(`Ivorypay verification failed: ${finalMessage}`);
  }

  async createWithdrawal(options: any) {
    this.logger.log(`Mock Ivorypay create withdrawal ${options.reference}`);
    return { data: { id: 'WD_123456' }, id: 'WD_123456' };
  }
}
