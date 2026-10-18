import axios from 'axios';
import { PaystackService } from './paystack.service';

describe('PaystackService Kenyan payout destinations', () => {
  let service: PaystackService;
  const originalEnvironment = {
    KE: process.env.KE,
    KE_BANKS: process.env.KE_BANKS,
    BANK_CODES: process.env.BANK_CODES,
    PAYSTACK_BANK_CODE_MAP: process.env.PAYSTACK_BANK_CODE_MAP,
  };

  beforeEach(() => {
    process.env.KE = JSON.stringify({
      KE: {
        'kenya commercial bank': '01',
        kcb: '01',
        'equity bank': '68',
        equity: '68',
      },
    });
    delete process.env.KE_BANKS;
    delete process.env.BANK_CODES;
    delete process.env.PAYSTACK_BANK_CODE_MAP;
    service = new PaystackService({
      get: jest.fn((key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? 'test-secret' : undefined,
      ),
    } as any);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it('fetches KES bank codes from Paystack with Kenya-specific parameters', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: true,
        data: [
          {
            name: 'Kenya Commercial Bank',
            slug: 'kcb',
            code: 'generic-code',
            bank_code: 'KEPS_01',
            type: 'kepss',
            currency: 'KES',
            active: true,
          },
          {
            name: 'Disabled Bank',
            code: 'DISABLED',
            active: false,
          },
        ],
      },
    } as any);

    const destinations = await service.getBanks('KES', 'kepss');

    expect(get).toHaveBeenCalledWith(
      'https://api.paystack.co/bank',
      expect.objectContaining({
        params: {
          currency: 'KES',
          country: 'kenya',
          use_kenya_code: true,
          type: 'kepss',
        },
      }),
    );
    expect(destinations).toEqual([
      expect.objectContaining({
        name: 'Kenya Commercial Bank',
        code: 'KEPS_01',
        bank_code: 'KEPS_01',
        type: 'kepss',
        currency: 'KES',
      }),
    ]);
  });

  it('resolves Kenyan withdrawal banks from the Paystack kepss bank codes', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: true,
        data: [
          {
            name: 'Kenya Commercial Bank',
            slug: 'kcb',
            code: 'generic-code',
            bank_code: 'KEPS_01',
            active: true,
          },
        ],
      },
    } as any);

    await expect(service.getBankCodeByName('KCB')).resolves.toBe('KEPS_01');
    expect(get).toHaveBeenCalledWith(
      'https://api.paystack.co/bank',
      expect.objectContaining({
        params: expect.objectContaining({
          currency: 'KES',
          country: 'kenya',
          use_kenya_code: true,
          type: 'kepss',
        }),
      }),
    );
  });

  it('returns Paystack mobile-money codes for KES destinations', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: true,
        data: [
          {
            name: 'M-Pesa',
            code: 'MPESA',
            type: 'mobile_money',
            currency: 'KES',
            active: true,
          },
        ],
      },
    } as any);

    await expect(service.getBanks('KES', 'mobile_money')).resolves.toEqual([
      expect.objectContaining({
        name: 'M-Pesa',
        code: 'MPESA',
        bank_code: 'MPESA',
        type: 'mobile_money',
        currency: 'KES',
      }),
    ]);
  });

  it('normalizes Kenyan mobile money phone numbers before recipient creation', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        status: true,
        data: { type: 'mobile_money', recipient_code: 'RCP_test' },
      },
    } as any);

    await service.createTransferRecipient({
      type: 'mobile_money',
      name: 'FARM User',
      account_number: '+254712345678',
      bank_code: 'MPESA',
      currency: 'KES',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.paystack.co/transferrecipient',
      expect.objectContaining({
        account_number: '0712345678',
        bank_code: 'MPESA',
      }),
      expect.any(Object),
    );
  });

  it('creates Kenyan bank recipients with the Paystack kepss bank code', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        status: true,
        data: { type: 'kepss', recipient_code: 'RCP_KEPS' },
      },
    } as any);

    await service.createTransferRecipient({
      type: 'kepss',
      name: 'FARM User',
      account_number: '12345678',
      bank_code: 'KEPS_01',
      currency: 'KES',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.paystack.co/transferrecipient',
      expect.objectContaining({
        type: 'kepss',
        bank_code: 'KEPS_01',
        currency: 'KES',
      }),
      expect.any(Object),
    );
  });

  it('rejects Nigerian nuban recipients for KES transfers', async () => {
    const post = jest.spyOn(axios, 'post');

    await expect(
      service.createTransferRecipient({
        type: 'nuban',
        name: 'FARM User',
        account_number: '12345678',
        bank_code: '01',
        currency: 'KES',
      }),
    ).rejects.toThrow('Kenyan Paystack recipients must use kepss');
    expect(post).not.toHaveBeenCalled();
  });

  it('verifies transfer outcomes using the Paystack transfer reference endpoint', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: true,
        data: {
          reference: 'withdrawal-ref',
          status: 'success',
          transfer_code: 'TRF_test',
        },
      },
    } as any);

    await expect(
      service.getTransferByReference('withdrawal-ref'),
    ).resolves.toMatchObject({
      reference: 'withdrawal-ref',
      status: 'success',
    });

    expect(get).toHaveBeenCalledWith(
      'https://api.paystack.co/transfer/verify/withdrawal-ref',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );
  });
});
