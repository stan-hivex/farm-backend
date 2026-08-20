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

  it('verifies transaction using the business verify endpoint and falls back to the legacy verify endpoint', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { success: false, statusCode: 404, message: 'Transaction not found' }, status: 404 })
      .mockResolvedValueOnce({ data: { success: true, data: { reference: 'ref1', status: 'SUCCESS' } }, status: 200 });

    const result = await service.verifyTransaction('ref1', 'ref1', ['ref1']);

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/business/transactions/ref1/verify',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'test-api-key' }) }),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.ivorypay.io/api/v1/transactions/ref1/verify',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'test-api-key' }) }),
    );
    expect(result.reference).toBe('ref1');
    expect(result.status).toBe('SUCCESS');
  });
});
