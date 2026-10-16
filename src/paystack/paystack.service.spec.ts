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

  it('serves Kenyan bank destinations from the environment without calling Paystack', async () => {
    const remoteGet = jest.spyOn(axios, 'get');

    await expect(service.getBanks('KES')).resolves.toEqual(
      expect.arrayContaining([
        {
          name: 'Kenya Commercial Bank',
          code: '01',
          type: 'kepss',
          currency: 'KES',
        },
        {
          name: 'Equity Bank',
          code: '68',
          type: 'kepss',
          currency: 'KES',
        },
        {
          name: 'M-Pesa',
          code: 'MPESA',
          type: 'mobile_money',
          currency: 'KES',
        },
      ]),
    );

    expect(remoteGet).not.toHaveBeenCalled();
  });

  it('returns only M-Pesa for the mobile money destination filter', async () => {
    await expect(service.getBanks('KES', 'mobile_money')).resolves.toEqual([
      {
        name: 'M-Pesa',
        code: 'MPESA',
        type: 'mobile_money',
        currency: 'KES',
      },
    ]);
  });

  it('resolves exact and unambiguous fuzzy Kenyan bank names', async () => {
    await expect(service.getBankCodeByName('KCB')).resolves.toBe('01');
    await expect(service.getBankCodeByName('commercial')).resolves.toBe('01');
    await expect(service.getBankCodeByName('Bank')).rejects.toThrow(
      'Invalid Kenyan bank: Bank',
    );
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
});
