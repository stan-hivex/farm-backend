import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

export class IvorypayPayoutOutcomeUnknownError extends Error {}

@Injectable()
export class IvorypayService {
  private readonly logger = new Logger(IvorypayService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly cryptoPayoutsEnabled: boolean;
  private readonly pricingUnavailableMessage =
    'Payment pricing is temporarily unavailable. Try again shortly.';

  constructor(private readonly cfg: ConfigService) {
    const rawBaseUrl = this.cfg.get<string>(
      'IVORYPAY_BASE_URL',
      'https://api.ivorypay.io/api',
    );
    const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.baseUrl = normalizedBaseUrl.endsWith('/api')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/api`;
    const configuredApiKey = this.cfg.get<string>('IVORYPAY_API_KEY');
    this.apiKey = configuredApiKey?.trim() || undefined;
    this.cryptoPayoutsEnabled =
      this.cfg.get<string>('IVORYPAY_CRYPTO_PAYOUTS_ENABLED')?.toLowerCase() ===
      'true';
  }

  private maskAddress(address: string | null | undefined): string {
    if (!address) return 'missing';
    const trimmed = address.trim();
    if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***`;
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
  }

  private assertCryptoPayoutsEnabled() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'IvoryPay crypto payouts are not configured because IVORYPAY_API_KEY is missing',
      );
    }
    if (!this.cryptoPayoutsEnabled) {
      throw new ServiceUnavailableException(
        'Crypto payouts are disabled in FARM configuration; verify IvoryPay payout permission before enabling IVORYPAY_CRYPTO_PAYOUTS_ENABLED',
      );
    }
  }

  async getCryptoTransferOptions(): Promise<
    Array<{ token: string; network: string; networkName: string }>
  > {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'IvoryPay crypto payouts are not configured for this account',
      );
    }
    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/crypto-transfer/supported/network-tokens`,
        {
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
      if (response.data?.success !== true) {
        throw new BadGatewayException(
          'IvoryPay returned an invalid crypto payout options response',
        );
      }
      const data = response.data?.data;
      if (!data || typeof data !== 'object') {
        throw new BadGatewayException(
          'IvoryPay returned an invalid crypto payout options response',
        );
      }

      const options = new Map<
        string,
        { token: string; network: string; networkName: string }
      >();
      const addOption = (entry: any, fallbackNetworkName = '') => {
        const token =
          typeof entry?.token === 'string'
            ? entry.token.trim().toUpperCase()
            : '';
        const network =
          typeof (entry?.network ?? entry?.blockchain) === 'string'
            ? (entry.network ?? entry.blockchain).trim()
            : fallbackNetworkName;
        const isEnabled =
          entry?.isSupported === true || entry?.isActive === true;
        const networkName =
          typeof entry?.networkName === 'string' && entry.networkName.trim()
            ? entry.networkName.trim()
            : fallbackNetworkName || network;
        if (isEnabled && token && network) {
          options.set(`${token}:${network}`, {
            token,
            network,
            networkName,
          });
        }
      };

      if (Array.isArray(data)) {
        for (const entry of data) addOption(entry);
      } else {
        for (const [networkName, entries] of Object.entries(data)) {
          if (!Array.isArray(entries)) continue;
          for (const entry of entries) addOption(entry, networkName);
        }
      }
      if (options.size === 0) {
        throw new ServiceUnavailableException(
          'IvoryPay has no enabled crypto payout networks for this merchant account',
        );
      }
      return [...options.values()].sort(
        (first, second) =>
          first.token.localeCompare(second.token) ||
          first.networkName.localeCompare(second.networkName),
      );
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      const status = error?.response?.status;
      this.logger.error(
        `IvoryPay crypto payout options lookup failed status=${status ?? 'unavailable'}: ${
          error?.response?.data?.message ??
          (error as Error)?.message ??
          'unknown error'
        }`,
      );
      throw new BadGatewayException(
        status
          ? `Could not load enabled crypto payout options from IvoryPay (HTTP ${status})`
          : 'Could not reach IvoryPay to load enabled crypto payout options',
      );
    }
  }

  async getProviderNetworks(token?: string) {
    const options = await this.getCryptoTransferOptions();
    const normalizedToken = token?.trim().toUpperCase();
    const filtered = normalizedToken
      ? options.filter((option) => option.token === normalizedToken)
      : options;
    if (normalizedToken && filtered.length === 0) {
      throw new BadRequestException(
        `IvoryPay does not enable ${normalizedToken} crypto payouts for this account`,
      );
    }
    return {
      success: true,
      options: filtered,
      ...(normalizedToken
        ? {
            token: normalizedToken,
            networks: filtered.map((option) => option.network),
          }
        : {}),
    };
  }

  private validateAddressForNetwork(
    network: string,
    address: string,
  ): string | null {
    const trimmed = address.trim();
    if (!trimmed) return 'Destination wallet address is required';

    const normalizedNetwork = network.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (
      ['BSC', 'BNBSMARTCHAIN', 'POLYGON', 'ETHEREUM', 'MAINNET', 'BASE'].some(
        (value) => normalizedNetwork.includes(value),
      )
    ) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        return `Invalid destination address for ${network}.`;
      }
    }

    if (normalizedNetwork.includes('SOL')) {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
        return `Invalid Solana address for ${network}.`;
      }
    }

    if (normalizedNetwork.includes('ALGORAND')) {
      if (!/^[A-Z2-7]{58}$/.test(trimmed)) {
        return `Invalid Algorand address for ${network}.`;
      }
    }

    if (normalizedNetwork.includes('BITCOIN')) {
      if (
        !/^(bc1|tb1)[a-zA-HJ-NP-Z0-9]{20,87}$|^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(
          trimmed,
        )
      ) {
        return `Invalid Bitcoin address for ${network}.`;
      }
    }

    return null;
  }

  async quoteCryptoTransfer(options: {
    amount: number;
    token: string;
    network: string;
    address: string;
    fiatCurrency: string;
  }) {
    this.assertCryptoPayoutsEnabled();
    const token = options.token.trim().toUpperCase();
    const network = options.network.trim();
    const address = options.address.trim();
    if (!Number.isFinite(options.amount) || options.amount <= 0) {
      throw new BadRequestException('Invalid crypto payout quote amount');
    }
    const addressError = this.validateAddressForNetwork(network, address);
    if (addressError) throw new BadRequestException(addressError);

    const enabledOptions = await this.getCryptoTransferOptions();
    if (
      !enabledOptions.some(
        (option) => option.token === token && option.network === network,
      )
    ) {
      throw new BadRequestException(
        `IvoryPay does not enable ${token} on ${network} for this account`,
      );
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/rates/crypto-transfer`,
        {
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
          },
          params: {
            amount: options.amount,
            token,
            network,
            fiatCurrency: options.fiatCurrency,
            address,
          },
          timeout: 10000,
        },
      );
      const quote = response.data?.data;
      const numericFields = [
        'platformFeeInCrypto',
        'gasFeeInCrypto',
        'totalAmountInCrypto',
        'amountInCryptoLessFee',
        'minimumAmountInCrypto',
        'rate',
      ];
      if (
        response.data?.success !== true ||
        !quote ||
        numericFields.some(
          (field) =>
            !Number.isFinite(Number(quote[field])) || Number(quote[field]) < 0,
        ) ||
        Number(quote.totalAmountInCrypto) <= 0 ||
        Number(quote.amountInCryptoLessFee) <= 0
      ) {
        throw new BadGatewayException(
          'IvoryPay returned an incomplete crypto payout quote',
        );
      }
      return {
        token,
        network,
        ...quote,
        totalAmountInCrypto: Number(quote.totalAmountInCrypto),
        amountInCryptoLessFee: Number(quote.amountInCryptoLessFee),
        gasFeeInCrypto: Number(quote.gasFeeInCrypto),
        platformFeeInCrypto: Number(quote.platformFeeInCrypto),
        minimumAmountInCrypto: Number(quote.minimumAmountInCrypto),
      };
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `IvoryPay crypto payout quote failed token=${token} network=${network}: ${
          error?.response?.data?.message ??
          (error as Error)?.message ??
          'unknown error'
        }`,
      );
      throw new BadGatewayException(
        'Could not obtain a current crypto payout fee quote from IvoryPay',
      );
    }
  }

  createCryptoWithdrawalQuoteToken(payload: Record<string, unknown>) {
    this.assertCryptoPayoutsEnabled();
    const quote = {
      ...payload,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(quote)).toString('base64url');
    const signature = createHmac('sha256', this.apiKey!)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  verifyCryptoWithdrawalQuoteToken(token: string) {
    this.assertCryptoPayoutsEnabled();
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) {
      throw new BadRequestException(
        'Invalid or expired crypto withdrawal quote',
      );
    }
    const expected = createHmac('sha256', this.apiKey!)
      .update(encoded)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, 'base64url');
    } catch {
      throw new BadRequestException(
        'Invalid or expired crypto withdrawal quote',
      );
    }
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new BadRequestException(
        'Invalid or expired crypto withdrawal quote',
      );
    }
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException(
        'Invalid or expired crypto withdrawal quote',
      );
    }
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
      throw new BadRequestException(
        'Crypto withdrawal quote expired; request a new quote',
      );
    }
    return payload;
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

    const normalizeKey = (key: string) =>
      key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchKey = (key: string) => {
      const normalized = normalizeKey(key);
      if (normalized === 'transactionid' || normalized === 'txnid')
        return 'transaction_id';
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
        if (
          mapped &&
          identifiers[mapped] == null &&
          value != null &&
          value !== ''
        ) {
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

    const match = value.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
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
      const queryReference =
        parsed.searchParams.get('reference') || parsed.searchParams.get('id');
      if (queryReference) {
        return queryReference;
      }

      const segments = parsed.pathname
        .split('/')
        .filter((segment) => !!segment);
      if (segments.length) {
        return segments[segments.length - 1];
      }
    } catch {
      // Ignore invalid URL parsing and fall back to string-based extraction.
    }

    const pathSegment = trimmed
      .split('/')
      .filter((segment) => !!segment)
      .pop();
    return pathSegment ?? trimmed;
  }

  private determinePrimaryProviderReference(
    identifiers: Record<string, any>,
    internalReference: string,
  ) {
    const candidate =
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
      null;

    if (candidate && candidate.toString().trim() !== internalReference) {
      return candidate.toString().trim();
    }

    const urlCandidate =
      this.extractUuidFromString(identifiers.checkout_url) ??
      this.extractUuidFromString(identifiers.payment_link) ??
      this.extractUuidFromString(identifiers.payment_url);
    return urlCandidate ?? null;
  }

  private determinePrimaryProviderTransactionId(
    identifiers: Record<string, any>,
    internalReference: string,
  ) {
    const urlCandidate =
      this.extractUuidFromString(identifiers.checkout_url) ??
      this.extractUuidFromString(identifiers.payment_link) ??
      this.extractUuidFromString(identifiers.payment_url);

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
      throw new ServiceUnavailableException('IvoryPay is not configured');
    }

    try {
      this.logger.log(
        `Ivorypay: creating payment ${options.reference} via ${this.baseUrl}`,
      );
      const body: any = {
        amount: options.amount,
        reference: options.reference,
        email: options.email,
        ...(options.firstName && { firstName: options.firstName }),
        ...(options.lastName && { lastName: options.lastName }),
        type: 'CRYPTO',
        mode: 'CHECKOUT',
        baseFiat: options.baseFiat || 'KES',
        crypto: options.crypto,
        ...(options.chain && { chain: options.chain }),
        ...(options.redirect_url && { redirect_url: options.redirect_url }),
        metadata: options.metadata
          ? typeof options.metadata === 'string'
            ? options.metadata
            : JSON.stringify(options.metadata)
          : null,
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/transactions`,
        body,
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
        this.logger.error(
          'Ivorypay createPayment returned invalid response',
          rawData,
        );
        throw new BadRequestException('Invalid Ivorypay response');
      }

      this.logger.log(
        `IvoryPay raw response: ${JSON.stringify(rawData, null, 2)}`,
      );

      const providerIdentifiers = this.extractProviderIdentifiers(rawData);
      const providerReference = this.determinePrimaryProviderReference(
        providerIdentifiers,
        options.reference,
      );
      const providerTransactionId = this.determinePrimaryProviderTransactionId(
        providerIdentifiers,
        options.reference,
      );
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
      const paymentLink =
        redirectUrl ??
        data.payment_link ??
        data.checkout_url ??
        data.url ??
        data.link ??
        data.checkout ??
        data.page_url ??
        data.collectionDetails?.checkoutUrl;
      if (typeof paymentLink !== 'string' || !paymentLink.trim()) {
        throw new BadGatewayException(
          'IvoryPay did not return a hosted checkout URL',
        );
      }

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
      const message =
        e.response?.data?.message || e.response?.data?.error || e.message;
      const statusCode = e.response?.status;
      const endpoint = `${this.baseUrl}/v1/transactions`;

      this.logger.error(
        `Ivorypay createPayment error [${statusCode}] ${endpoint}: ${message}`,
      );
      if (e.response?.data?.errors) {
        this.logger.debug(
          `Ivorypay validation errors: ${JSON.stringify(e.response.data.errors)}`,
        );
      }
      if (e.response?.data) {
        this.logger.debug(
          `Ivorypay response body: ${JSON.stringify(e.response.data)}`,
        );
      }
      throw new BadRequestException(`Ivorypay integration failed: ${message}`);
    }
  }

  async getSupportedPaymentOptions(): Promise<
    Array<{ token: string; network: string; networkName: string }>
  > {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('IvoryPay is not configured');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/v1/tokens/supported/network-tokens`,
        {
          headers: {
            Authorization: this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );
      const groupedTokens = response.data?.data;
      if (!groupedTokens || typeof groupedTokens !== 'object') {
        throw new BadGatewayException(
          'IvoryPay returned an invalid supported-token response',
        );
      }

      const options = new Map<
        string,
        { token: string; network: string; networkName: string }
      >();
      const addOption = (item: any, fallbackNetworkName = '') => {
        const token =
          typeof item?.token === 'string'
            ? item.token.trim().toUpperCase()
            : '';
        const network =
          typeof (item?.network ?? item?.blockchain) === 'string'
            ? (item.network ?? item.blockchain).trim()
            : fallbackNetworkName;
        const isActive = item?.isActive === true || item?.isSupported === true;
        const networkName =
          typeof item?.networkName === 'string' && item.networkName.trim()
            ? item.networkName.trim()
            : fallbackNetworkName || network;
        if (isActive && token && network) {
          options.set(`${token}:${network}`, { token, network, networkName });
        }
      };

      if (Array.isArray(groupedTokens)) {
        for (const item of groupedTokens) addOption(item);
      } else {
        for (const [networkName, networkTokens] of Object.entries(
          groupedTokens,
        )) {
          if (!Array.isArray(networkTokens)) continue;
          for (const item of networkTokens) addOption(item, networkName);
        }
      }
      if (options.size === 0) {
        throw new BadGatewayException(
          'IvoryPay has no active crypto payment options',
        );
      }
      return [...options.values()].sort(
        (first, second) =>
          first.token.localeCompare(second.token) ||
          first.networkName.localeCompare(second.networkName),
      );
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      const message =
        error?.response?.data?.message ??
        (error as Error)?.message ??
        'IvoryPay token lookup failed';
      const status = error?.response?.status;
      this.logger.error(
        `IvoryPay supported-token lookup failed status=${status ?? 'unavailable'}: ${message}`,
      );
      throw new BadGatewayException(
        status
          ? `Could not load supported crypto payment options from IvoryPay (HTTP ${status})`
          : 'Could not reach IvoryPay to load supported crypto payment options',
      );
    }
  }

  async getSupportedPaymentTokens(): Promise<string[]> {
    const options = await this.getSupportedPaymentOptions();
    return [...new Set(options.map((option) => option.token))].sort();
  }

  async verifyTransaction(
    reference: string,
    providerReference?: string,
    fallbackReferences: string[] = [],
  ) {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'IvoryPay transaction verification is unavailable because IVORYPAY_API_KEY is not configured',
      );
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
      this.logger.warn(
        `Ivorypay: no valid provider identifiers available to verify transaction for internalReference=${reference}`,
      );
      throw new BadRequestException(
        'Ivorypay verification failed: no provider identifiers available',
      );
    }

    let lastError: any = null;
    for (const lookupReference of candidates) {
      const lookupId = this.extractLookupIdentifier(lookupReference);
      if (!lookupId) {
        this.logger.warn(
          `Ivorypay: skipping verify candidate ${lookupReference} — no usable lookup identifier`,
        );
        lastError = new Error('Candidate missing lookup identifier');
        continue;
      }

      const verifyUrls = [
        `${this.baseUrl}/v1/business/transactions/${encodeURIComponent(lookupId)}/verify`,
        `${this.baseUrl}/v1/transactions/${encodeURIComponent(lookupId)}/verify`,
      ];

      for (const verifyUrl of verifyUrls) {
        try {
          this.logger.log(
            `Ivorypay: verifying transaction ${lookupId} (internal reference=${reference}) via ${verifyUrl}`,
          );
          const response = await axios.get(verifyUrl, {
            headers: {
              Authorization: `${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.data || response.data.success === false) {
            const message =
              response.data?.message ||
              response.data?.error ||
              'Ivorypay verification failed';
            if (response.data?.statusCode === 404 || response.status === 404) {
              this.logger.warn(
                `Ivorypay verify returned 404 for ${lookupReference} via ${verifyUrl}; trying alternate endpoint or reference`,
              );
              lastError = new Error(message);
              continue;
            }
            throw new BadRequestException(
              `Ivorypay verification failed: ${message}`,
            );
          }

          const verifiedData = response.data.data ?? response.data;
          const status = verifiedData?.status ?? response.data?.status;
          if (!status) {
            this.logger.warn(
              `Ivorypay verify response for ${lookupReference} missing status field: ${JSON.stringify(response.data)}`,
            );
            throw new BadRequestException(
              'Ivorypay verification failed: missing status field',
            );
          }

          const providerIdentifiers =
            this.extractProviderIdentifiers(verifiedData);
          verifiedData.providerIdentifiers = providerIdentifiers;
          verifiedData.providerReference = lookupReference;
          verifiedData.reference = verifiedData.reference ?? reference;

          this.logger.log(
            `Ivorypay: verified transaction ${lookupReference} (internalReference=${reference}) status=${status} ` +
              `providerTransactionId=${providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? 'n/a'} checkoutId=${providerIdentifiers.checkout_id ?? 'n/a'} paymentId=${providerIdentifiers.payment_id ?? 'n/a'} providerReference=${providerIdentifiers.provider_reference ?? 'n/a'}`,
          );

          return verifiedData;
        } catch (e: any) {
          const message =
            e.response?.data?.message || e.response?.data?.error || e.message;
          if (
            e.response?.status === 404 ||
            e.response?.data?.statusCode === 404
          ) {
            this.logger.warn(
              `Ivorypay verify endpoint missing for ${lookupReference} via ${verifyUrl}: ${message}`,
            );
            lastError = e;
            continue;
          }

          this.logger.error(
            `Ivorypay verify error for ${lookupReference} via ${verifyUrl}: ${message}`,
          );
          if (e.response?.data) {
            this.logger.debug(
              `Ivorypay verify response body: ${JSON.stringify(e.response.data)}`,
            );
          }
          throw new BadRequestException(
            `Ivorypay verification failed: ${message}`,
          );
        }
      }
    }

    const finalMessage =
      lastError?.response?.data?.message ||
      lastError?.message ||
      'Ivorypay verification failed';
    throw new BadRequestException(
      `Ivorypay verification failed: ${finalMessage}`,
    );
  }

  async createWithdrawal(options: any) {
    this.assertCryptoPayoutsEnabled();
    const amount = Number(options.amount);
    const token = String(options.token ?? '')
      .trim()
      .toUpperCase();
    const address = String(options.address ?? '').trim();
    const network = String(options.network ?? '').trim();
    const reference = options.reference;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid crypto withdrawal amount');
    }
    if (!token || !network) {
      throw new BadRequestException('Crypto token and network are required');
    }
    if (!address) {
      throw new BadRequestException(
        'Destination wallet address is required for crypto withdrawal',
      );
    }
    const invalidAddressMessage = this.validateAddressForNetwork(
      network,
      address,
    );
    if (invalidAddressMessage) {
      throw new BadRequestException(invalidAddressMessage);
    }
    if (!reference) {
      throw new BadRequestException(
        'Missing withdrawal reference for crypto transfer',
      );
    }

    const enabledOptions = await this.getCryptoTransferOptions();
    if (
      !enabledOptions.some(
        (option) => option.token === token && option.network === network,
      )
    ) {
      throw new BadRequestException(
        `IvoryPay does not enable ${token} on ${network} for this account`,
      );
    }

    const requestBody = {
      network,
      address,
      amount,
      token,
      reference,
    };

    const endpoint = `${this.baseUrl}/v1/crypto-transfer`;
    this.logger.log(
      `IvoryPay crypto payout submitted token=${token} amount=${amount} network=${network} address=${this.maskAddress(address)} reference=${reference}`,
    );

    try {
      const response = await axios.post(endpoint, requestBody, {
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const rawData = response.data;
      if (!rawData || rawData.success !== true || !rawData.data) {
        const message =
          rawData?.message ||
          rawData?.error ||
          'Invalid IvoryPay payout response';
        this.logger.error(
          `IvoryPay rejected crypto payout reference=${reference} status=${response.status} message=${message}`,
        );
        throw new BadRequestException(message);
      }

      const data = rawData.data;
      const providerReference = data.reference ?? reference;
      const providerTransactionId = data.id ?? null;

      this.logger.log(
        `IvoryPay payout accepted reference=${reference} providerReference=${providerReference} providerId=${providerTransactionId ?? 'missing'} status=${data.status ?? 'unknown'}`,
      );
      return {
        rawResponse: rawData,
        data,
        providerReference,
        providerTransactionId,
      };
    } catch (e: any) {
      const statusCode = Number(e.response?.status ?? 0);
      const providerMessage =
        e.response?.data?.message ??
        e.response?.data?.error ??
        e.message ??
        'unknown error';
      this.logger.error(
        `IvoryPay payout request error reference=${reference} status=${statusCode || 'unknown'} message=${providerMessage}`,
      );
      if (e instanceof BadRequestException) throw e;
      if (
        statusCode >= 400 &&
        statusCode < 500 &&
        statusCode !== 408 &&
        statusCode !== 429
      ) {
        throw new BadRequestException(
          typeof providerMessage === 'string' && providerMessage.trim()
            ? `IvoryPay rejected the crypto payout: ${providerMessage}`
            : 'IvoryPay rejected the crypto payout request. Verify the amount, network and destination, then request a new quote.',
        );
      }
      throw new IvorypayPayoutOutcomeUnknownError(
        'IvoryPay payout outcome is unknown; funds remain reserved pending reconciliation',
      );
    }
  }
}
