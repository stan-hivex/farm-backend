import { PaymentsService } from './payments.service';

describe('PaymentsService.getExchangeRate', () => {
  it('returns cached exchange rates without hitting Prisma when available', async () => {
    const prisma = {
      exchange_rates: {
        findFirst: jest.fn(),
      },
    };
    const cache = {
      cacheGet: jest.fn().mockResolvedValue(130),
      cacheSet: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PaymentsService(
      prisma as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      cache as any,
    );

    await expect(service.getExchangeRate('USD', 'FARM')).resolves.toBe(130);
    expect(prisma.exchange_rates.findFirst).not.toHaveBeenCalled();
    expect(cache.cacheSet).not.toHaveBeenCalled();
  });
});

describe('PaymentsService merchant QR mobile-money checkout', () => {
  const createService = (phone: string | null = null) => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'merchant@example.com',
          phone,
          first_name: 'Merchant',
          last_name: 'Owner',
        }),
      },
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      },
      transactions: {
        create: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
      },
      audit_logs: { create: jest.fn().mockResolvedValue({}) },
      deposit: { create: jest.fn().mockResolvedValue({}) },
    };
    const paystack = {
      initializePayment: jest.fn().mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/reference',
      }),
    };
    const service = new PaymentsService(
      prisma as any,
      {} as any,
      {} as any,
      paystack as any,
      {} as any,
      {} as any,
    );
    (service as any).getExchangeRate = jest.fn().mockResolvedValue(130);
    (service as any).assessFraudRisk = jest
      .fn()
      .mockResolvedValue({ block: false });

    return { service, paystack };
  };

  it('uses the payer email and lets hosted checkout collect the phone number', async () => {
    const { service, paystack } = createService();

    await service.initiateDeposit('merchant-1', {
      amount_fiat: 100,
      currency: 'KES',
      paymentMethod: 'MOBILE_MONEY',
      email: 'customer@example.com',
      callbackUrl: 'https://farmapp-e2145.web.app/merchant-payment/',
      merchantQrCheckout: true,
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'customer@example.com',
        channels: ['mobile_money'],
      }),
    );
    expect(paystack.initializePayment.mock.calls[0][0]).not.toHaveProperty(
      'phone',
    );
  });

  it('continues requiring a phone number for non-QR mobile-money deposits', async () => {
    const { service, paystack } = createService();

    await expect(
      service.initiateDeposit('user-1', {
        amount_fiat: 100,
        currency: 'KES',
        paymentMethod: 'MOBILE_MONEY',
      }),
    ).rejects.toThrow('Phone number is required for mobile money deposits');

    expect(paystack.initializePayment).not.toHaveBeenCalled();
  });

  it('initializes KES bank-transfer deposits with Paystack bank checkout', async () => {
    const { service, paystack } = createService();
    paystack.initializePayment.mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/reference',
      access_code: 'pesalink-access-code',
    });

    const result = await service.initiateDeposit('user-1', {
      amount_fiat: 100,
      currency: 'KES',
      paymentMethod: 'BANK_TRANSFER',
      email: 'customer@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        currency: 'KES',
        channels: ['bank'],
      }),
    );
    expect(result.data).toMatchObject({
      provider: 'PAYSTACK',
      payment_url: 'https://checkout.paystack.com/reference',
      authorization_url: 'https://checkout.paystack.com/reference',
      access_code: 'pesalink-access-code',
    });
  });
});

describe('PaymentsService crypto deposits', () => {
  it('creates a NOWPayments invoice in USD for the selected coin', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'customer@example.com',
          phone: '+254700000000',
          first_name: 'Test',
          last_name: 'Customer',
        }),
      },
      wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      transactions: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      audit_logs: { create: jest.fn().mockResolvedValue({}) },
      deposit: { create: jest.fn().mockResolvedValue({}) },
    };
    const nowpayments = {
      getAvailableCurrencies: jest
        .fn()
        .mockResolvedValue(['usdc', 'usdttrc20']),
      createInvoice: jest.fn().mockResolvedValue({
        invoice_id: 'inv-1',
        invoice_url: 'https://nowpayments.io/payment/?iid=inv-1',
      }),
    };
    const cache = {
      cacheGet: jest.fn().mockResolvedValue(1),
      cacheSet: jest.fn().mockResolvedValue(undefined),
    };
    const conversion = {
      getCurrentRate: jest.fn().mockResolvedValue({ farm_usd_rate: 0.01 }),
    };
    const service = new PaymentsService(
      prisma as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      cache as any,
      conversion as any,
      nowpayments as any,
    );
    (service as any).assessFraudRisk = jest.fn().mockResolvedValue({
      block: false,
    });

    const result = await service.initiateDeposit('user-1', {
      amount_fiat: 100,
      currency: 'KES',
      paymentMethod: 'CRYPTO',
      email: 'customer@example.com',
      firstName: 'Test',
      lastName: 'Customer',
      crypto: 'USDC',
      callbackUrl: 'https://farmapp-e2145.web.app/merchant-payment/',
      merchantQrCheckout: true,
    } as any);

    const invoice = nowpayments.createInvoice.mock.calls[0][0];
    expect(invoice).toMatchObject({
      priceCurrency: 'usd',
      payCurrency: 'usdc',
    });
    expect(invoice.priceAmount).toBeGreaterThan(0);
    expect(prisma.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transaction_reference: invoice.orderId,
          metadata: expect.objectContaining({
            provider: 'nowpayments',
            nowpayments_invoice_id: 'inv-1',
            pay_currency: 'usdc',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      data: { checkout_url: 'https://nowpayments.io/payment/?iid=inv-1' },
    });
  });
});
