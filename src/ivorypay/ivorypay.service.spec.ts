import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { IvorypayService } from './ivorypay.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('IvorypayService', () => {
  let service: IvorypayService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'IVORYPAY_BASE_URL') return 'https://api.ivorypay.io/api';
        if (key === 'IVORYPAY_API_KEY') return 'test-api-key';
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new IvorypayService(configService);
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
  });

  it('creates a hosted crypto checkout with the documented request shape', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          reference: '550e8400-e29b-41d4-a716-446655440000',
          checkoutUrl:
            'https://checkout.ivorypay.io/checkout/550e8400-e29b-41d4-a716-446655440000',
        },
      },
    } as any);

    const result = await service.createPayment({
      amount: 2.5,
      reference: '550e8400-e29b-41d4-a716-446655440000',
      email: 'customer@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      type: 'CRYPTO',
      mode: 'CHECKOUT',
      baseFiat: 'USD',
      crypto: 'USDC',
      chain: 'POLYGON',
      redirect_url: 'https://farmapp.africa/payment-callback',
      metadata: { user_id: 'user-1' },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/transactions',
      expect.objectContaining({
        amount: 2.5,
        reference: '550e8400-e29b-41d4-a716-446655440000',
        email: 'customer@example.com',
        firstName: 'Test',
        lastName: 'Customer',
        type: 'CRYPTO',
        mode: 'CHECKOUT',
        baseFiat: 'USD',
        crypto: 'USDC',
        chain: 'POLYGON',
        redirect_url: 'https://farmapp.africa/payment-callback',
        metadata: JSON.stringify({ user_id: 'user-1' }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-api-key',
        }),
      }),
    );
    const requestBody = mockedAxios.post.mock.calls[0][1] as Record<string, unknown>;
    expect(requestBody).toHaveProperty('crypto', 'USDC');
    expect(requestBody).toHaveProperty('chain', 'POLYGON');
    expect(result.checkout_url).toBe(
      'https://checkout.ivorypay.io/checkout/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('trims surrounding whitespace from the configured API key', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'IVORYPAY_BASE_URL') return 'https://api.ivorypay.io/api';
        if (key === 'IVORYPAY_API_KEY') return '  test-api-key \n';
        return defaultValue;
      }),
    } as unknown as ConfigService;
    const configuredService = new IvorypayService(configService);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          checkoutUrl: 'https://checkout.ivorypay.io/checkout/reference',
        },
      },
    } as any);

    await configuredService.createPayment({
      amount: 10,
      reference: 'reference',
      email: 'customer@example.com',
      crypto: 'USDT',
      baseFiat: 'USD',
    });

    expect(mockedAxios.post.mock.calls[0][2].headers).toMatchObject({
      Authorization: 'test-api-key',
    });
  });

  it('creates a Puul checkout session with all active tokens and networks', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          Solana: [
            { token: 'SOL', blockchain: 'SOLANA', isActive: true },
            { token: 'USDC', blockchain: 'SOLANA', isActive: true },
          ],
          Ethereum: [
            { token: 'USDT', blockchain: 'ETHEREUM', isActive: true },
          ],
          Inactive: [
            { token: 'TEST', blockchain: 'TESTNET', isActive: false },
          ],
        },
      },
    } as any);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          reference: 'puul-reference',
          checkoutUrl: 'https://checkout.joinpuul.com/session/puul-reference',
        },
      },
    } as any);

    const result = await service.createCheckoutSession({
      amount: 100,
      fiatCurrency: 'USD',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.joinpuul.com/api/v1/checkout/sessions',
      {
        amount: 100,
        fiatCurrency: 'USD',
        acceptedTokens: ['SOL', 'USDC', 'USDT'],
        acceptedNetworks: ['SOLANA', 'ETHEREUM'],
      },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'test-api-key' }),
      }),
    );
    expect(result.checkout_url).toBe(
      'https://checkout.joinpuul.com/session/puul-reference',
    );
    expect(result.providerReference).toBe('puul-reference');
  });

  it('returns all active token and network combinations enabled for the business', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          'Binance Smart Chain': [
            { token: 'USDT', blockchain: 'BSC_TESTNET', isActive: true },
            { token: 'USDC', blockchain: 'BSC_TESTNET', isActive: false },
          ],
          Polygon: [{ token: 'usdc', blockchain: 'POLYGON', isActive: true }],
        },
      },
    } as any);

    await expect(service.getSupportedPaymentOptions()).resolves.toEqual([
      { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      {
        token: 'USDT',
        network: 'BSC_TESTNET',
        networkName: 'Binance Smart Chain',
      },
    ]);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          'Binance Smart Chain': [
            { token: 'USDT', blockchain: 'BSC_TESTNET', isActive: true },
          ],
          Polygon: [{ token: 'usdc', blockchain: 'POLYGON', isActive: true }],
        },
      },
    } as any);
    await expect(service.getSupportedPaymentTokens()).resolves.toEqual([
      'USDC',
      'USDT',
    ]);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/tokens/supported/network-tokens',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-api-key',
        }),
      }),
    );
  });

  it('normalizes a host-only base URL to the documented /api base path', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'IVORYPAY_BASE_URL') return 'https://api.ivorypay.io/';
        if (key === 'IVORYPAY_API_KEY') return 'test-api-key';
        return defaultValue;
      }),
    } as unknown as ConfigService;
    const hostOnlyService = new IvorypayService(configService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { Polygon: [{ token: 'USDT', isActive: true }] },
      },
    } as any);

    await hostOnlyService.getSupportedPaymentTokens();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/tokens/supported/network-tokens',
      expect.any(Object),
    );
  });

  it('extracts tx_ref, trxref, and transaction_reference from Ivorypay payload', () => {
    const result = (service as any).extractProviderIdentifiers({
      tx_ref: 'TX123',
      trxref: 'TRX123',
      transaction_reference: 'TRAN123',
      transaction_id: 'TID123',
      payment_id: 'PID123',
      checkout_id: 'CID123',
      provider_reference: 'PR123',
      reference: 'REF123',
      id: 'ID123',
    });

    expect(result).toMatchObject({
      transaction_id: 'TID123',
      payment_id: 'PID123',
      checkout_id: 'CID123',
      provider_reference: 'PR123',
      tx_ref: 'TX123',
      trxref: 'TRX123',
      transaction_reference: 'TRAN123',
      reference: 'REF123',
      id: 'ID123',
    });
  });

  it('returns canonical provider networks for supported tokens', () => {
    expect(service.getProviderNetworks('usdc')).toEqual({
      success: true,
      token: 'USDC',
      networks: ['BSC', 'POLYGON', 'SOL', 'BASE', 'STARKNET', 'ALGORAND'],
    });
  });

  it('rejects unsupported provider network tokens', () => {
    expect(() => service.getProviderNetworks('DAI')).toThrow('Unsupported crypto token');
  });

  it('chooses tx_ref before trxref and transaction_reference when determining primary reference', () => {
    const identifiers = {
      transaction_id: null,
      id: null,
      provider_reference: null,
      tx_ref: 'TX123',
      trxref: 'TRX123',
      transaction_reference: 'TRAN123',
      payment_id: null,
      checkout_id: null,
      reference: null,
    };

    const primary = (service as any).determinePrimaryProviderReference(identifiers);
    expect(primary).toBe('TX123');
  });

  it('falls back to trxref and transaction_reference when tx_ref is absent', () => {
    const identifiers = {
      transaction_id: null,
      id: null,
      provider_reference: null,
      tx_ref: null,
      trxref: 'TRX123',
      transaction_reference: 'TRAN123',
      payment_id: null,
      checkout_id: null,
      reference: null,
    };

    const primary = (service as any).determinePrimaryProviderReference(identifiers);
    expect(primary).toBe('TRX123');
  });

  it('extracts lookup identifiers from URLs, query params, and raw strings', () => {
    const lookup = (service as any).extractLookupIdentifier.bind(service);

    expect(lookup('https://checkout.ivorypay.io/checkout/550e8400-e29b-41d4-a716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(lookup('https://example.com/pay?reference=abc123')).toBe('abc123');
    expect(lookup('abc123')).toBe('abc123');
  });

  it('verifies Puul checkout sessions before falling back to IvoryPay transaction endpoints', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { success: false, statusCode: 404, message: 'Transaction not found' }, status: 404 })
      .mockResolvedValueOnce({ data: { success: true, data: { reference: 'ref1', status: 'SUCCESS' } }, status: 200 });

    const result = await service.verifyTransaction('ref1', 'ref1', ['ref1']);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.joinpuul.com/api/v1/checkout/sessions/ref1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'test-api-key' }) }),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/business/transactions/ref1/verify',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'test-api-key' }) }),
    );
    expect(result.reference).toBe('ref1');
    expect(result.status).toBe('SUCCESS');
  });

  it('normalizes a paid Puul session to a successful payment status', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { reference: 'puul-ref', status: 'PAID', amount: 100 } },
      status: 200,
    } as any);

    const result = await service.verifyTransaction('farm-ref', 'puul-ref');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.joinpuul.com/api/v1/checkout/sessions/puul-ref',
      expect.any(Object),
    );
    expect(result.status).toBe('success');
  });
});
