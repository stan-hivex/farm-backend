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
      status: 201,
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
    const requestBody = mockedAxios.post.mock.calls[0][1] as Record<
      string,
      unknown
    >;
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
      status: 201,
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

  it('reads the documented flat crypto payout network response', async () => {
    const payoutService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : key === 'IVORYPAY_API_KEY'
            ? 'test-api-key'
            : key === 'IVORYPAY_CRYPTO_PAYOUTS_ENABLED'
              ? 'true'
              : defaultValue,
      ),
    } as unknown as ConfigService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { token: 'USDC', network: 'POLYGON', isSupported: true },
          { token: 'USDT', network: 'SOLANA', isSupported: false },
        ],
      },
    } as any);

    await expect(payoutService.getCryptoTransferOptions()).resolves.toEqual([
      { token: 'USDC', network: 'POLYGON', networkName: 'POLYGON' },
    ]);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/crypto-transfer/supported/network-tokens',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-api-key',
        }),
      }),
    );
  });

  it('loads supported payout networks when the local payout feature flag is unset', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ token: 'USDC', network: 'POLYGON', isSupported: true }],
      },
    } as any);

    await expect(service.getCryptoTransferOptions()).resolves.toEqual([
      { token: 'USDC', network: 'POLYGON', networkName: 'POLYGON' },
    ]);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/crypto-transfer/supported/network-tokens',
      expect.any(Object),
    );
  });

  it('still requires crypto payouts to be enabled before submitting a transfer', async () => {
    await expect(
      service.createWithdrawal({
        amount: 1,
        token: 'USDC',
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        reference: 'withdrawal-reference',
      }),
    ).rejects.toThrow(
      'IvoryPay crypto payouts are disabled by FARM configuration; enable IVORYPAY_CRYPTO_PAYOUTS_ENABLED only after payout access is confirmed with IvoryPay',
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('reports missing API credentials separately from a disabled payout feature', async () => {
    const unconfiguredService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : key === 'IVORYPAY_CRYPTO_PAYOUTS_ENABLED'
            ? 'true'
            : defaultValue,
      ),
    } as unknown as ConfigService);

    await expect(
      unconfiguredService.createWithdrawal({
        amount: 1,
        token: 'USDC',
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        reference: 'withdrawal-reference',
      }),
    ).rejects.toThrow(
      'IvoryPay crypto payouts are not configured because IVORYPAY_API_KEY is missing',
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('submits the documented crypto payout body to IvoryPay', async () => {
    const payoutService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : key === 'IVORYPAY_API_KEY'
            ? 'test-api-key'
            : key === 'IVORYPAY_CRYPTO_PAYOUTS_ENABLED'
              ? 'true'
              : defaultValue,
      ),
    } as unknown as ConfigService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ token: 'USDC', network: 'POLYGON', isSupported: true }],
      },
    } as any);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'payout-id',
          reference: 'withdrawal-reference',
          status: 'PENDING',
        },
      },
    } as any);

    await expect(
      payoutService.createWithdrawal({
        amount: 1,
        token: 'USDC',
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        reference: 'withdrawal-reference',
      }),
    ).resolves.toMatchObject({
      providerTransactionId: 'payout-id',
      providerReference: 'withdrawal-reference',
      data: { status: 'PENDING' },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/crypto-transfer',
      {
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        amount: 1,
        token: 'USDC',
        reference: 'withdrawal-reference',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-api-key',
          'Content-Type': 'application/json',
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

  it('returns available provider networks for a supported token', async () => {
    jest.spyOn(service, 'getCryptoTransferOptions').mockResolvedValue([
      { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      { token: 'USDC', network: 'BSC_TESTNET', networkName: 'BSC' },
      { token: 'USDT', network: 'SOLANA', networkName: 'Solana' },
    ]);

    await expect(service.getProviderNetworks('usdc')).resolves.toEqual({
      success: true,
      token: 'USDC',
      options: [
        { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
        { token: 'USDC', network: 'BSC_TESTNET', networkName: 'BSC' },
      ],
      networks: ['POLYGON', 'BSC_TESTNET'],
    });
  });

  it('rejects tokens that are not enabled for payouts', async () => {
    jest
      .spyOn(service, 'getCryptoTransferOptions')
      .mockResolvedValue([
        { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      ]);

    await expect(service.getProviderNetworks('DAI')).rejects.toThrow(
      'IvoryPay does not enable DAI crypto payouts for this account',
    );
  });

  it('retries a temporary IvoryPay pricing outage with the same withdrawal reference', async () => {
    const payoutService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : key === 'IVORYPAY_API_KEY'
            ? 'test-api-key'
            : key === 'IVORYPAY_CRYPTO_PAYOUTS_ENABLED'
              ? 'true'
              : defaultValue,
      ),
    } as unknown as ConfigService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ token: 'USDC', network: 'POLYGON', isSupported: true }],
      },
    } as any);
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          message:
            'Payment pricing is temporarily unavailable. Try again shortly.',
        },
      },
    });

    await expect(
      payoutService.createWithdrawal({
        amount: 3.00763446,
        token: 'USDC',
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        reference: 'withdrawal-ref',
      }),
    ).rejects.toThrow(
      'IvoryPay rejected the crypto payout: Payment pricing is temporarily unavailable. Try again shortly.',
    );

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('does not retry other provider validation errors', async () => {
    const payoutService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : key === 'IVORYPAY_API_KEY'
            ? 'test-api-key'
            : key === 'IVORYPAY_CRYPTO_PAYOUTS_ENABLED'
              ? 'true'
              : defaultValue,
      ),
    } as unknown as ConfigService);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ token: 'USDC', network: 'POLYGON', isSupported: true }],
      },
    } as any);
    mockedAxios.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Invalid destination address' },
      },
    });

    await expect(
      payoutService.createWithdrawal({
        amount: 3,
        token: 'USDC',
        network: 'POLYGON',
        address: '0x0e892b10a8104855837652906a869acadd07a142',
        reference: 'withdrawal-ref',
      }),
    ).rejects.toThrow(
      'IvoryPay rejected the crypto payout: Invalid destination address',
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
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

    const primary = (service as any).determinePrimaryProviderReference(
      identifiers,
    );
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

    const primary = (service as any).determinePrimaryProviderReference(
      identifiers,
    );
    expect(primary).toBe('TRX123');
  });

  it('extracts lookup identifiers from URLs, query params, and raw strings', () => {
    const lookup = (service as any).extractLookupIdentifier.bind(service);

    expect(
      lookup(
        'https://checkout.ivorypay.io/checkout/550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(lookup('https://example.com/pay?reference=abc123')).toBe('abc123');
    expect(lookup('abc123')).toBe('abc123');
  });

  it('verifies transaction using the business verify endpoint and falls back to the legacy verify endpoint', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          success: false,
          statusCode: 404,
          message: 'Transaction not found',
        },
        status: 404,
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { reference: 'ref1', status: 'SUCCESS' } },
        status: 200,
      });

    const result = await service.verifyTransaction('ref1', 'ref1', ['ref1']);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/business/transactions/ref1/verify',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'test-api-key' }),
      }),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/transactions/ref1/verify',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'test-api-key' }),
      }),
    );
    expect(result.reference).toBe('ref1');
    expect(result.status).toBe('SUCCESS');
  });

  it('does not report an unverified transaction as successful when the API key is missing', async () => {
    const unconfiguredService = new IvorypayService({
      get: jest.fn((key: string, defaultValue?: any) =>
        key === 'IVORYPAY_BASE_URL'
          ? 'https://api.ivorypay.io/api'
          : defaultValue,
      ),
    } as unknown as ConfigService);

    await expect(
      unconfiguredService.verifyTransaction('withdrawal-reference'),
    ).rejects.toThrow(
      'IvoryPay transaction verification is unavailable because IVORYPAY_API_KEY is not configured',
    );
  });
});
