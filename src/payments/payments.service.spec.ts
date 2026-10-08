import { PaymentsService } from './payments.service';

describe('PaymentsService transaction histories', () => {
  it('filters unsuccessful deposits and withdrawals from user history', async () => {
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      },
      transactions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PaymentsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getDepositHistory('user-1');
    await service.getWithdrawalHistory('user-1');

    for (const [options] of prisma.transactions.findMany.mock.calls) {
      expect(options.where.status.notIn).toEqual(
        expect.arrayContaining(['failed', 'cancelled', 'reversed']),
      );
    }
  });
});

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
      {} as any,
    );

    await expect(service.getExchangeRate('USD', 'FARM')).resolves.toBe(130);
    expect(prisma.exchange_rates.findFirst).not.toHaveBeenCalled();
    expect(cache.cacheSet).not.toHaveBeenCalled();
  });
});

describe('PaymentsService crypto deposits', () => {
  it('sends a UUID reference and the selected token to IvoryPay', async () => {
    const prisma = {
      users: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
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
    const ivorypay = {
      getProviderNetworks: jest.fn().mockReturnValue({
        networks: ['BSC', 'POLYGON', 'SOL', 'BASE', 'STARKNET', 'ALGORAND'],
      }),
      createPayment: jest.fn().mockResolvedValue({
        data: {
          checkoutUrl: 'https://checkout.ivorypay.io/checkout/reference',
        },
        checkout_url: 'https://checkout.ivorypay.io/checkout/reference',
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
      ivorypay as any,
      {} as any,
      cache as any,
      conversion as any,
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
      chain: 'POLYGON',
      walletAddress: '0x1234567890123456789012345678901234567890',
    });

    const paymentOptions = ivorypay.createPayment.mock.calls[0][0];
    expect(paymentOptions.reference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(paymentOptions).toMatchObject({
      email: 'customer@example.com',
      crypto: 'USDC',
      chain: 'POLYGON',
      baseFiat: 'USD',
    });
    expect(prisma.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transaction_reference: paymentOptions.reference,
          metadata: expect.objectContaining({
            chain: 'POLYGON',
            sender_wallet_address:
              '0x1234567890123456789012345678901234567890',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      data: {
        payment_link:
          'https://checkout.ivorypay.io/checkout/reference',
        checkout_url:
          'https://checkout.ivorypay.io/checkout/reference',
        checkoutUrl:
          'https://checkout.ivorypay.io/checkout/reference',
      },
    });
  });
});
