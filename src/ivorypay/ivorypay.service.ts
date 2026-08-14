import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const SUPPORTED_CRYPTO_TOKENS = ['USDC', 'USDT'] as const;
const SUPPORTED_NETWORKS_BY_TOKEN: Record<string, Record<string, string>> = {
  USDC: {
    BSC: 'BSC',
    BEP20: 'BSC',
    'BNB SMART CHAIN': 'BSC',
    'BNB SMART CHAIN (BEP20)': 'BSC',
    POLYGON: 'POLYGON',
    MATIC: 'POLYGON',
    SOL: 'SOL',
    SOLANA: 'SOL',
    BASE: 'BASE',
    STARKNET: 'STARKNET',
    ALGORAND: 'ALGORAND',
  },
  USDT: {
    BSC: 'BSC',
    BEP20: 'BSC',
    'BNB SMART CHAIN': 'BSC',
    'BNB SMART CHAIN (BEP20)': 'BSC',
    POLYGON: 'POLYGON',
    MATIC: 'POLYGON',
    SOL: 'SOL',
    SOLANA: 'SOL',
    BASE: 'BASE',
    STARKNET: 'STARKNET',
    ALGORAND: 'ALGORAND',
  },
};

@Injectable()
export class IvorypayService {
  private readonly logger = new Logger(IvorypayService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly networkCache: Map<string, { ts: number; networks: string[] }> = new Map();

  constructor(private readonly cfg: ConfigService) {
    const rawBaseUrl = this.cfg.get<string>('IVORYPAY_BASE_URL', 'https://api.ivorypay.io/api');
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.apiKey = this.cfg.get<string>('IVORYPAY_API_KEY');
  }

  private maskAddress(address: string | null | undefined): string {
    if (!address) return 'missing';
    const trimmed = address.trim();
    if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***`;
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  private normalizeToken(token: string | undefined): string | null {
    const raw = (token ?? '').toString().trim().toUpperCase();
    if (!raw) return null;
    return SUPPORTED_CRYPTO_TOKENS.includes(raw as typeof SUPPORTED_CRYPTO_TOKENS[number]) ? raw : null;
  }

  private normalizeNetwork(token: string | undefined, inputNetwork: string | undefined): string | null {
    const normalizedToken = this.normalizeToken(token);
    const raw = (inputNetwork ?? '').toString().trim();
    if (!normalizedToken || !raw) return null;
    // First try to match against the provider's enabled networks for this token
    try {
      const providerNetworks = this.networkCache.has(normalizedToken)
        ? this.networkCache.get(normalizedToken)!.networks
        : [];
      const desired = raw.toString().toUpperCase();
      for (const n of providerNetworks) {
        if (!n) continue;
        const candidate = n.toString().toUpperCase();
        if (candidate === desired) return n; // exact match
        const alias = candidate.replace(/[^A-Z0-9]/g, '');
        const desiredAlias = desired.replace(/[^A-Z0-9]/g, '');
        if (alias === desiredAlias) return n;
      }
    } catch (e) {
      // fall back to local lookup below
    }

    const lookup = SUPPORTED_NETWORKS_BY_TOKEN[normalizedToken] ?? {};
    const key = raw.toUpperCase();
    if (lookup[key]) return lookup[key];
    const alias = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const [candidate, value] of Object.entries(lookup)) {
      if (candidate.replace(/[^A-Z0-9]/g, '') === alias) {
        return value;
      }
    }
    return null;
  }

  private async fetchProviderNetworks(token: string): Promise<string[]> {
    if (!token) return [];
    const now = Date.now();
    const cached = this.networkCache.get(token);
    if (cached && now - cached.ts < 1000 * 60 * 5) {
      return cached.networks;
    }

    if (!this.apiKey) return [];

    try {
      const url = `${this.baseUrl}/v1/crypto-transfer/${encodeURIComponent(token)}/networks`;
      const resp = await axios.get(url, {
        headers: { Authorization: `${this.apiKey}`, 'Content-Type': 'application/json' },
      });
      const data = resp.data?.data ?? resp.data ?? null;
      const networks: string[] = Array.isArray(data) ? data.map((i: any) => (i?.network ?? i).toString()) : [];
      this.networkCache.set(token, { ts: now, networks });
      return networks;
    } catch (e: any) {
      this.logger.debug(`Failed to fetch provider networks for ${token}: ${e?.message ?? e}`);
      return [];
    }
  }

  private validateAddressForNetwork(network: string, address: string): string | null {
    const trimmed = address.trim();
    if (!trimmed) return 'Destination wallet address is required';

    if (['BSC', 'POLYGON', 'BASE', 'STARKNET'].includes(network)) {
      if (!/^0x[a-fA-F0-9]+$/.test(trimmed) || trimmed.length < 20) {
        return `Invalid destination address for ${network}.`;
      }
    }

    if (network === 'SOL') {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        return `Invalid Solana address for ${network}.`;
      }
    }

    if (network === 'ALGORAND') {
      if (!/^[A-Z2-7]{58}$/.test(trimmed)) {
        return `Invalid Algorand address for ${network}.`;
      }
    }

    return null;
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

  private extractLookupIdentifier(value: any): string | null {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const trimmed = value.trim();
    const uuid = this.extractUuidFromString(trimmed);
    if (uuid) {
      return uuid;
    }

    try {
      const parsed = new URL(trimmed);
      const queryReference = parsed.searchParams.get('reference') || parsed.searchParams.get('id');
      if (queryReference) {
        return queryReference;
      }

      const segments = parsed.pathname.split('/').filter((segment) => !!segment);
      if (segments.length) {
        return segments[segments.length - 1];
      }
    } catch {
      // Ignore invalid URL parsing and fall back to string-based extraction.
    }

    const pathSegment = trimmed.split('/').filter((segment) => !!segment).pop();
    return pathSegment ?? trimmed;
  }

  private determinePrimaryProviderReference(identifiers: Record<string, any>, internalReference: string) {
    const candidate = (
      identifiers.provider_reference ||
      identifiers.tx_ref ||
      identifiers.trxref ||
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

    const rawCandidates = [
      reference,
      providerReference?.toString()?.trim(),
      ...fallbackReferences.map((id) => id?.toString()?.trim()),
    ]
      .filter((id): id is string => !!id)
      .map((id) => id.trim());

    const candidates = Array.from(new Set(rawCandidates));
    if (!candidates.length) {
      this.logger.warn(`Ivorypay: no valid provider identifiers available to verify transaction for internalReference=${reference}`);
      throw new BadRequestException('Ivorypay verification failed: no provider identifiers available');
    }

    let lastError: any = null;
    for (const lookupReference of candidates) {
      const lookupId = this.extractLookupIdentifier(lookupReference);
      if (!lookupId) {
        this.logger.warn(`Ivorypay: skipping verify candidate ${lookupReference} — no usable lookup identifier`);
        lastError = new Error('Candidate missing lookup identifier');
        continue;
      }

      const verifyUrls = [
        `${this.baseUrl}/v1/business/transactions/${encodeURIComponent(lookupId)}/verify`,
        `${this.baseUrl}/v1/transactions/${encodeURIComponent(lookupId)}/verify`,
      ];

      for (const verifyUrl of verifyUrls) {
        try {
          this.logger.log(`Ivorypay: verifying transaction ${lookupId} (internal reference=${reference}) via ${verifyUrl}`);
          const response = await axios.get(verifyUrl, {
            headers: {
              Authorization: `${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.data || response.data.success === false) {
            const message = response.data?.message || response.data?.error || 'Ivorypay verification failed';
            if (response.data?.statusCode === 404 || response.status === 404) {
              this.logger.warn(`Ivorypay verify returned 404 for ${lookupReference} via ${verifyUrl}; trying alternate endpoint or reference`);
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
          if (e.response?.status === 404 || e.response?.data?.statusCode === 404) {
            this.logger.warn(`Ivorypay verify endpoint missing for ${lookupReference} via ${verifyUrl}: ${message}`);
            lastError = e;
            continue;
          }

          this.logger.error(`Ivorypay verify error for ${lookupReference} via ${verifyUrl}: ${message}`);
          if (e.response?.data) {
            this.logger.debug(`Ivorypay verify response body: ${JSON.stringify(e.response.data)}`);
          }
          throw new BadRequestException(`Ivorypay verification failed: ${message}`);
        }
      }
    }

    const finalMessage = lastError?.response?.data?.message || lastError?.message || 'Ivorypay verification failed';
    throw new BadRequestException(`Ivorypay verification failed: ${finalMessage}`);
  }

  async createWithdrawal(options: any) {
    const amount = Number(options.amount);
    const token = this.normalizeToken(options.token || options.crypto || options.cryptoAsset);
    const address = options.address || options.to_address || options.cryptoAddress || options.walletAddress || options.walletaddress || options.wallet_address;
    const normalizedNetwork = this.normalizeNetwork(token ?? undefined, options.network ?? options.blockchain ?? options.chain);
    const reference = options.reference;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid crypto withdrawal amount');
    }
    if (!token) {
      throw new BadRequestException('Unsupported crypto asset for withdrawal. Only USDC and USDT are allowed.');
    }
    if (!address || !address.trim()) {
      throw new BadRequestException('Destination wallet address is required for crypto withdrawal');
    }
    if (!normalizedNetwork) {
      throw new BadRequestException(`Unsupported network for ${token}. Please choose a supported network for this asset.`);
    }
    const invalidAddressMessage = this.validateAddressForNetwork(normalizedNetwork, address);
    if (invalidAddressMessage) {
      throw new BadRequestException(invalidAddressMessage);
    }
    if (!reference) {
      throw new BadRequestException('Missing withdrawal reference for crypto transfer');
    }

    const requestBody = {
      network: normalizedNetwork,
      address: address.trim(),
      amount,
      token,
      reference,
    };

    const endpoint = `${this.baseUrl}/v1/crypto-transfer`;
    this.logger.log(
      `Ivorypay crypto withdrawal request: endpoint=${endpoint} method=POST token=${token} amount=${amount} network=${normalizedNetwork} address=${this.maskAddress(address)} reference=${reference}`,
    );

    if (!this.apiKey) {
      this.logger.warn('IVORYPAY_API_KEY not configured, returning mock Ivorypay create withdrawal');
      return {
        rawResponse: { status: true, message: 'Mock withdrawal created', data: { id: 'WD_123456', reference, amount, token, network: normalizedNetwork, address, status: 'PENDING' } },
        data: { id: 'WD_123456', reference, amount, token, network: normalizedNetwork, address, status: 'PENDING' },
        providerReference: reference,
        providerTransactionId: 'WD_123456',
      };
    }

    try {
      // Attempt to align network with provider-supported values if possible
      const providerNetworks = await this.fetchProviderNetworks(token);
      if (Array.isArray(providerNetworks) && providerNetworks.length) {
        const candidate = providerNetworks.find((n) => (n ?? '').toString().toUpperCase() === (normalizedNetwork ?? '').toString().toUpperCase()) ||
          providerNetworks.find((n) => (n ?? '').toString().replace(/[^A-Z0-9]/g, '') === (normalizedNetwork ?? '').toString().replace(/[^A-Z0-9]/g, ''));
        if (candidate) {
          requestBody.network = candidate;
        }
      }

      const response = await axios.post(endpoint, requestBody, {
        headers: {
          Authorization: `${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const rawData = response.data;
      if (!rawData || rawData.status === false) {
        const message = rawData?.message || rawData?.error || 'Invalid Ivorypay response';
        this.logger.error(
          `Ivorypay crypto withdrawal failed: endpoint=${endpoint} status=${response.status} message=${message} responseBody=${JSON.stringify(rawData ?? {})}`,
        );
        // Preserve provider response in error
        throw new BadRequestException(message);
      }

      const data = rawData.data ?? rawData;
      const providerReference = data.reference ?? reference;
      const providerTransactionId = data.id ?? null;

      this.logger.log(`Ivorypay crypto withdrawal created: reference=${providerReference}, id=${providerTransactionId}, status=${data.status ?? 'unknown'}`);
      return {
        rawResponse: rawData,
        data,
        providerReference,
        providerTransactionId,
      };
    } catch (e: any) {
      const providerMessage = e.response?.data?.message || e.response?.data?.error || e.response?.data?.detail || e.message || 'Invalid data';
      const statusCode = e.response?.status ?? 'unknown';
      const responseBody = e.response?.data ?? e.response ?? null;

      this.logger.error(
        `Ivorypay crypto withdrawal request failed: endpoint=${endpoint} method=POST status=${statusCode} request=${JSON.stringify(requestBody)} response=${JSON.stringify(responseBody ?? {})}`,
      );

      // Persist provider message in thrown error for upstream handlers to record
      if (statusCode === 400 || statusCode === 422) {
        throw new BadRequestException(providerMessage || 'Crypto withdrawal could not be completed. Please verify the amount, network and wallet address.');
      }

      throw new BadRequestException(`Ivorypay crypto withdrawal failed: ${providerMessage}`);
    }
  }
}
