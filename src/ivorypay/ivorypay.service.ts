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

  private scanProviderIdentifiers(data: any) {
    const identifiers: Record<string, any> = {
      transaction_id: null,
      payment_id: null,
      checkout_id: null,
      provider_reference: null,
      merchant_reference: null,
      invoice_id: null,
      tx_ref: null,
      trxref: null,
      transaction_reference: null,
      payment_reference: null,
      reference: null,
      id: null,
      checkout_url: null,
      payment_link: null,
      payment_url: null,
      paymentUrl: null,
      checkoutUrl: null,
    };

    const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchKey = (key: string) => {
      const normalized = normalizeKey(key);
      if (normalized === 'transactionid' || normalized === 'txnid') return 'transaction_id';
      if (normalized === 'paymentid') return 'payment_id';
      if (normalized === 'checkoutid') return 'checkout_id';
      if (normalized === 'providerreference') return 'provider_reference';
      if (normalized === 'merchantreference') return 'merchant_reference';
      if (normalized === 'invoiceid') return 'invoice_id';
      if (normalized === 'paymentreference') return 'payment_reference';
      if (normalized === 'txref' || normalized === 'tx_ref') return 'tx_ref';
      if (normalized === 'trxref' || normalized === 'trx_ref') return 'trxref';
      if (normalized === 'transactionreference') return 'transaction_reference';
      if (normalized === 'checkouturl') return 'checkout_url';
      if (normalized === 'paymentlink') return 'payment_link';
      if (normalized === 'paymenturl') return 'payment_url';
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
        }
        if (typeof value === 'object' && value !== null) {
          scan(value);
        }
      }
    };

    scan(data);
    return identifiers;
  }

  public extractProviderIdentifiers(data: any) {
    return this.scanProviderIdentifiers(data);
  }

  private extractUuidFromString(value: any): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  private determinePrimaryProviderReference(identifiers: Record<string, any>, internalReference: string) {
    const candidate = (
      identifiers.provider_reference ||
      identifiers.transaction_reference ||
      identifiers.transaction_id ||
      identifiers.id ||
      identifiers.payment_id ||
      identifiers.checkout_id ||
      identifiers.payment_reference ||
      identifiers.merchant_reference ||
      identifiers.invoice_id ||
      identifiers.reference ||
      null
    );

    if (candidate && candidate.toString().trim() !== internalReference) {
      return candidate.toString().trim();
    }

    const urlCandidate = this.extractUuidFromString(identifiers.checkout_url) ?? this.extractUuidFromString(identifiers.payment_link) ?? this.extractUuidFromString(identifiers.payment_url);
    return urlCandidate ?? null;
  }

  private determinePrimaryProviderTransactionId(identifiers: Record<string, any>, internalReference: string) {
    const urlCandidate = this.extractUuidFromString(identifiers.checkout_url) ?? this.extractUuidFromString(identifiers.payment_link) ?? this.extractUuidFromString(identifiers.payment_url);

    const normalizedCandidates = [
      identifiers.transaction_id,
      identifiers.payment_id,
      identifiers.provider_reference,
      identifiers.transaction_reference,
      identifiers.reference,
      identifiers.id,
      identifiers.tx_ref,
      identifiers.trxref,
      identifiers.invoice_id,
      urlCandidate,
    ]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => value.toString().trim())
      .filter((value) => value !== internalReference);

    return normalizedCandidates.length ? normalizedCandidates[0] : null;
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

      const rawData = response.data;
      const data = rawData?.data ?? rawData;
      if (!data) {
        this.logger.error('Ivorypay createPayment returned invalid response', rawData);
        throw new BadRequestException('Invalid Ivorypay response');
      }

      this.logger.log(`IvoryPay raw response: ${JSON.stringify(rawData, null, 2)}`);

      const providerIdentifiers = this.extractProviderIdentifiers(rawData);
      const providerReference = this.determinePrimaryProviderReference(providerIdentifiers, options.reference);
      const providerTransactionId = this.determinePrimaryProviderTransactionId(providerIdentifiers, options.reference);
      const redirectUrl =
        data.payment_link ||
        data.checkout_url ||
        data.paymentUrl ||
        data.checkoutUrl ||
        data.payment_url ||
        data.url ||
        data.link ||
        data.page_url ||
        data.collectionDetails?.checkoutUrl ||
        null;
      const paymentLink = redirectUrl ?? data.payment_link ?? data.checkout_url ?? data.url ?? data.link ?? data.checkout ?? data.page_url ?? data.collectionDetails?.checkoutUrl;

      this.logger.log(
        `Ivorypay createPayment success: internalReference=${options.reference} ` +
        `providerTransactionId=${providerTransactionId ?? 'missing'} ` +
        `checkoutId=${providerIdentifiers.checkout_id ?? 'missing'} ` +
        `paymentId=${providerIdentifiers.payment_id ?? 'missing'} ` +
        `providerReference=${providerReference ?? 'missing'} ` +
        `redirectUrl=${redirectUrl ?? 'missing'}`,
      );

      return {
        rawResponse: rawData,
        data,
        payment_link: paymentLink,
        checkout_url: paymentLink,
        providerReference,
        providerTransactionId,
        providerIdentifiers,
        redirectUrl,
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

    const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const rawCandidates = [
      providerReference?.toString()?.trim(),
      ...fallbackReferences.map((id) => id?.toString()?.trim()),
    ]
      .filter((id): id is string => !!id)
      .map((id) => id.trim());

    // Remove duplicates and any candidate that exactly matches our internal
    // reference (we should never query the provider using our UUID).
    const uniqueCandidates = Array.from(new Set(rawCandidates));
    const filteredCandidates = uniqueCandidates.filter((c) => c !== reference);

    // Keep the first candidate even if it looks like a UUID because it may be
    // the provider reference returned by Ivorypay. However, we must not use
    // our own internal UUID as a lookup reference — it's a local id only.
    const candidates = filteredCandidates.filter((value, index) => index === 0 || !uuidV4.test(value));

    if (uniqueCandidates.length && filteredCandidates.length !== uniqueCandidates.length) {
      this.logger.warn(`Ivorypay: removed internal reference from verify candidates for ${reference}`);
    }

    if (!candidates.length) {
      this.logger.warn(`Ivorypay: no valid provider identifiers available to verify transaction for internalReference=${reference}`);
      throw new BadRequestException('Ivorypay verification failed: no provider identifiers available');
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
