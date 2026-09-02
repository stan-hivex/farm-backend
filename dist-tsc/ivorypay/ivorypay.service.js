"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var IvorypayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IvorypayService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const SUPPORTED_CRYPTO_TOKENS = ['USDC', 'USDT'];
const SUPPORTED_NETWORKS_BY_TOKEN = {
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
let IvorypayService = IvorypayService_1 = class IvorypayService {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(IvorypayService_1.name);
        const rawBaseUrl = this.cfg.get('IVORYPAY_BASE_URL', 'https://api.ivorypay.io/api');
        this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
        this.apiKey = this.cfg.get('IVORYPAY_API_KEY');
    }
    maskAddress(address) {
        if (!address)
            return 'missing';
        const trimmed = address.trim();
        if (trimmed.length <= 10)
            return `${trimmed.slice(0, 2)}***`;
        return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
    }
    normalizeToken(token) {
        const raw = (token ?? '').toString().trim().toUpperCase();
        if (!raw)
            return null;
        return SUPPORTED_CRYPTO_TOKENS.includes(raw) ? raw : null;
    }
    getProviderNetworks(token) {
        const normalizedToken = this.normalizeToken(token);
        if (!normalizedToken) {
            throw new common_1.BadRequestException('Unsupported crypto token. Only USDC and USDT are allowed.');
        }
        return {
            success: true,
            token: normalizedToken,
            networks: Array.from(new Set(Object.values(SUPPORTED_NETWORKS_BY_TOKEN[normalizedToken]))),
        };
    }
    normalizeNetwork(token, inputNetwork) {
        const normalizedToken = this.normalizeToken(token);
        const raw = (inputNetwork ?? '').toString().trim();
        if (!normalizedToken || !raw)
            return null;
        const lookup = SUPPORTED_NETWORKS_BY_TOKEN[normalizedToken] ?? {};
        const key = raw.toUpperCase();
        if (lookup[key])
            return lookup[key];
        const alias = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (const [candidate, value] of Object.entries(lookup)) {
            if (candidate.replace(/[^A-Z0-9]/g, '') === alias) {
                return value;
            }
        }
        return null;
    }
    validateAddressForNetwork(network, address) {
        const trimmed = address.trim();
        if (!trimmed)
            return 'Destination wallet address is required';
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
    scanProviderIdentifiers(data) {
        const identifiers = {
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
        const normalizeKey = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchKey = (key) => {
            const normalized = normalizeKey(key);
            if (normalized === 'transactionid' || normalized === 'txnid')
                return 'transaction_id';
            if (normalized === 'paymentid')
                return 'payment_id';
            if (normalized === 'checkoutid')
                return 'checkout_id';
            if (normalized === 'providerreference')
                return 'provider_reference';
            if (normalized === 'merchantreference')
                return 'merchant_reference';
            if (normalized === 'invoiceid')
                return 'invoice_id';
            if (normalized === 'paymentreference')
                return 'payment_reference';
            if (normalized === 'txref' || normalized === 'tx_ref')
                return 'tx_ref';
            if (normalized === 'trxref' || normalized === 'trx_ref')
                return 'trxref';
            if (normalized === 'transactionreference')
                return 'transaction_reference';
            if (normalized === 'checkouturl')
                return 'checkout_url';
            if (normalized === 'paymentlink')
                return 'payment_link';
            if (normalized === 'paymenturl')
                return 'payment_url';
            if (normalized === 'reference')
                return 'reference';
            if (normalized === 'id')
                return 'id';
            return null;
        };
        const scan = (obj) => {
            if (!obj || typeof obj !== 'object')
                return;
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
    extractProviderIdentifiers(data) {
        return this.scanProviderIdentifiers(data);
    }
    extractUuidFromString(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return null;
        }
        const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        return match ? match[0] : null;
    }
    extractLookupIdentifier(value) {
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
        }
        catch {
        }
        const pathSegment = trimmed.split('/').filter((segment) => !!segment).pop();
        return pathSegment ?? trimmed;
    }
    determinePrimaryProviderReference(identifiers, internalReference) {
        const candidate = (identifiers.provider_reference ||
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
            null);
        if (candidate && candidate.toString().trim() !== internalReference) {
            return candidate.toString().trim();
        }
        const urlCandidate = this.extractUuidFromString(identifiers.checkout_url) ?? this.extractUuidFromString(identifiers.payment_link) ?? this.extractUuidFromString(identifiers.payment_url);
        return urlCandidate ?? null;
    }
    determinePrimaryProviderTransactionId(identifiers, internalReference) {
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
    async createPayment(options) {
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
            const body = {
                amount: options.amount,
                reference: options.reference,
                email: options.email,
                type: 'CRYPTO',
                mode: 'CHECKOUT',
                baseFiat: options.baseFiat || 'KES',
                crypto: options.crypto || 'USDT',
                metadata: options.metadata ? (typeof options.metadata === 'string' ? options.metadata : JSON.stringify(options.metadata)) : null,
            };
            const response = await axios_1.default.post(`${this.baseUrl}/v1/transactions`, body, {
                headers: {
                    Authorization: `${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            const rawData = response.data;
            const data = rawData?.data ?? rawData;
            if (!data) {
                this.logger.error('Ivorypay createPayment returned invalid response', rawData);
                throw new common_1.BadRequestException('Invalid Ivorypay response');
            }
            this.logger.log(`IvoryPay raw response: ${JSON.stringify(rawData, null, 2)}`);
            const providerIdentifiers = this.extractProviderIdentifiers(rawData);
            const providerReference = this.determinePrimaryProviderReference(providerIdentifiers, options.reference);
            const providerTransactionId = this.determinePrimaryProviderTransactionId(providerIdentifiers, options.reference);
            const redirectUrl = data.payment_link ||
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
            this.logger.log(`Ivorypay createPayment success: internalReference=${options.reference} ` +
                `providerTransactionId=${providerTransactionId ?? 'missing'} ` +
                `checkoutId=${providerIdentifiers.checkout_id ?? 'missing'} ` +
                `paymentId=${providerIdentifiers.payment_id ?? 'missing'} ` +
                `providerReference=${providerReference ?? 'missing'} ` +
                `redirectUrl=${redirectUrl ?? 'missing'}`);
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
        }
        catch (e) {
            const message = e.response?.data?.message || e.response?.data?.error || e.message;
            const statusCode = e.response?.status;
            const endpoint = `${this.baseUrl}/v1/transactions`;
            this.logger.error(`Ivorypay createPayment error [${statusCode}] ${endpoint}: ${message}`);
            if (e.response?.data?.errors) {
                this.logger.debug(`Ivorypay validation errors: ${JSON.stringify(e.response.data.errors)}`);
            }
            if (e.response?.data) {
                this.logger.debug(`Ivorypay response body: ${JSON.stringify(e.response.data)}`);
            }
            throw new common_1.BadRequestException(`Ivorypay integration failed: ${message}`);
        }
    }
    async verifyTransaction(reference, providerReference, fallbackReferences = []) {
        if (!this.apiKey) {
            this.logger.warn('IVORYPAY_API_KEY not configured, returning mock verify');
            return { status: 'completed', reference };
        }
        const rawCandidates = [
            reference,
            providerReference?.toString()?.trim(),
            ...fallbackReferences.map((id) => id?.toString()?.trim()),
        ]
            .filter((id) => !!id)
            .map((id) => id.trim());
        const candidates = Array.from(new Set(rawCandidates));
        if (!candidates.length) {
            this.logger.warn(`Ivorypay: no valid provider identifiers available to verify transaction for internalReference=${reference}`);
            throw new common_1.BadRequestException('Ivorypay verification failed: no provider identifiers available');
        }
        let lastError = null;
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
                    const response = await axios_1.default.get(verifyUrl, {
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
                        throw new common_1.BadRequestException(`Ivorypay verification failed: ${message}`);
                    }
                    const verifiedData = response.data.data ?? response.data;
                    const status = verifiedData?.status ?? response.data?.status;
                    if (!status) {
                        this.logger.warn(`Ivorypay verify response for ${lookupReference} missing status field: ${JSON.stringify(response.data)}`);
                        throw new common_1.BadRequestException('Ivorypay verification failed: missing status field');
                    }
                    const providerIdentifiers = this.extractProviderIdentifiers(verifiedData);
                    verifiedData.providerIdentifiers = providerIdentifiers;
                    verifiedData.providerReference = lookupReference;
                    verifiedData.reference = verifiedData.reference ?? reference;
                    this.logger.log(`Ivorypay: verified transaction ${lookupReference} (internalReference=${reference}) status=${status} ` +
                        `providerTransactionId=${providerIdentifiers.transaction_id ?? providerIdentifiers.id ?? 'n/a'} checkoutId=${providerIdentifiers.checkout_id ?? 'n/a'} paymentId=${providerIdentifiers.payment_id ?? 'n/a'} providerReference=${providerIdentifiers.provider_reference ?? 'n/a'}`);
                    return verifiedData;
                }
                catch (e) {
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
                    throw new common_1.BadRequestException(`Ivorypay verification failed: ${message}`);
                }
            }
        }
        const finalMessage = lastError?.response?.data?.message || lastError?.message || 'Ivorypay verification failed';
        throw new common_1.BadRequestException(`Ivorypay verification failed: ${finalMessage}`);
    }
    async createWithdrawal(options) {
        const amount = Number(options.amount);
        const token = this.normalizeToken(options.token || options.crypto || options.cryptoAsset);
        const address = options.address || options.to_address || options.cryptoAddress || options.walletAddress || options.walletaddress || options.wallet_address;
        const normalizedNetwork = this.normalizeNetwork(token ?? undefined, options.network ?? options.blockchain ?? options.chain);
        const reference = options.reference;
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new common_1.BadRequestException('Invalid crypto withdrawal amount');
        }
        if (!token) {
            throw new common_1.BadRequestException('Unsupported crypto asset for withdrawal. Only USDC and USDT are allowed.');
        }
        if (!address || !address.trim()) {
            throw new common_1.BadRequestException('Destination wallet address is required for crypto withdrawal');
        }
        if (!normalizedNetwork) {
            throw new common_1.BadRequestException(`Unsupported network for ${token}. Please choose a supported network for this asset.`);
        }
        const invalidAddressMessage = this.validateAddressForNetwork(normalizedNetwork, address);
        if (invalidAddressMessage) {
            throw new common_1.BadRequestException(invalidAddressMessage);
        }
        if (!reference) {
            throw new common_1.BadRequestException('Missing withdrawal reference for crypto transfer');
        }
        const requestBody = {
            network: normalizedNetwork,
            address: address.trim(),
            amount,
            token,
            reference,
        };
        const endpoint = `${this.baseUrl}/v1/crypto-transfer`;
        this.logger.log(`Ivorypay crypto withdrawal request: endpoint=${endpoint} method=POST token=${token} amount=${amount} network=${normalizedNetwork} address=${this.maskAddress(address)} reference=${reference}`);
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
            const response = await axios_1.default.post(endpoint, requestBody, {
                headers: {
                    Authorization: `${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            const rawData = response.data;
            if (!rawData || rawData.status === false) {
                const message = rawData?.message || rawData?.error || 'Invalid Ivorypay response';
                this.logger.error(`Ivorypay crypto withdrawal failed: endpoint=${endpoint} status=${response.status} message=${message} responseBody=${JSON.stringify(rawData ?? {})}`);
                throw new common_1.BadRequestException(message);
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
        }
        catch (e) {
            const providerMessage = e.response?.data?.message || e.response?.data?.error || e.response?.data?.detail || e.message || 'Invalid data';
            const statusCode = e.response?.status ?? 'unknown';
            const responseBody = e.response?.data ?? e.response ?? null;
            this.logger.error(`Ivorypay crypto withdrawal request failed: endpoint=${endpoint} method=POST status=${statusCode} request=${JSON.stringify(requestBody)} response=${JSON.stringify(responseBody ?? {})}`);
            if (statusCode === 400 || statusCode === 422) {
                throw new common_1.BadRequestException('Crypto withdrawal could not be completed. Please verify the amount, network and wallet address.');
            }
            throw new common_1.BadRequestException(`Ivorypay crypto withdrawal failed: ${providerMessage}`);
        }
    }
};
exports.IvorypayService = IvorypayService;
exports.IvorypayService = IvorypayService = IvorypayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], IvorypayService);
//# sourceMappingURL=ivorypay.service.js.map