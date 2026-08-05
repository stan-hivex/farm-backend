import { ConfigService } from '@nestjs/config';
import { IvorypayService } from './ivorypay.service';

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

    expect(result).toEqual({
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
});
