jest.mock('../paystack/paystack.service', () => ({
  PaystackService: class PaystackService {},
}));

import { QrPaymentsService } from './qr-payments.service';

describe('QrPaymentsService checkout initialization', () => {
  const merchant = {
    id: 'merchant-1',
    user_id: 'owner-1',
    status: 'approved',
    business_name: 'Farm Shop',
    business_email: 'shop@example.com',
    qr_code: '{"merchant_id":"merchant-1"}',
    users_merchants_user_idTousers: { email: 'owner@example.com' },
  };

  const createService = () => {
    const transaction = { id: 'transaction-1' };
    const createTransaction = jest.fn().mockResolvedValue(transaction);
    const prisma: any = {
      merchants: { findUnique: jest.fn().mockResolvedValue(merchant) },
      wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      $transaction: jest.fn((callback) =>
        callback({
          transactions: { create: createTransaction },
          qr_payments: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
      transactions: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const paystack = {
      initializePayment: jest.fn().mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/reference',
      }),
    };
    const ivorypay = {
      getSupportedPaymentOptions: jest
        .fn()
        .mockResolvedValue([
          { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
        ]),
      createPayment: jest.fn().mockResolvedValue({
        payment_link: 'https://checkout.ivorypay.io/reference',
      }),
    };
    const currencyConversion = {
      getCurrentRate: jest.fn().mockResolvedValue({
        farm_kes_rate: 130,
        farm_usd_rate: 1.3,
      }),
    };
    const service = new QrPaymentsService(
      prisma,
      paystack as any,
      ivorypay as any,
      currencyConversion as any,
      {} as any,
      {} as any,
      {} as any,
      { createForTransaction: jest.fn(), enqueuePdfAndEmail: jest.fn() } as any,
    );
    return { service, prisma, paystack, ivorypay, createTransaction };
  };

  it('uses the Paystack bank_transfer channel for QR bank checkout', async () => {
    const { service, paystack, createTransaction } = createService();

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'bank',
      guestEmail: 'customer@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        currency: 'KES',
        channels: ['bank_transfer'],
      }),
    );
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: 'Public QR payment to Farm Shop',
        }),
      }),
    );
  });

  it('uses the deployed Firebase success page as the provider callback', async () => {
    const { service, paystack } = createService();

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'card',
      guestEmail: 'customer@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        callback_url: expect.stringMatching(
          /^https:\/\/farmapp-e2145\.web\.app\/pay\/success\?reference=QR-/,
        ),
      }),
    );
  });

  it('initializes mobile money checkout without collecting a phone number', async () => {
    const { service, paystack } = createService();

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'mpesa',
      guestEmail: 'customer@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 100,
        currency: 'KES',
        channels: ['mobile_money'],
      }),
    );
    expect(paystack.initializePayment.mock.calls[0][0]).not.toHaveProperty(
      'phone',
    );
  });

  it('initializes crypto checkout using an active IvoryPay token/network pair', async () => {
    const { service, ivorypay } = createService();

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'crypto',
      guestEmail: 'customer@example.com',
      crypto: 'USDC',
      chain: 'POLYGON',
    });

    expect(ivorypay.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        currency: 'USD',
        crypto: 'USDC',
        chain: 'POLYGON',
        baseFiat: 'USD',
      }),
    );
    expect(ivorypay.createPayment.mock.calls[0][0].reference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const callback = new URL(
      ivorypay.createPayment.mock.calls[0][0].redirect_url,
    );
    expect(callback.searchParams.get('reference')).toBe(
      ivorypay.createPayment.mock.calls[0][0].reference,
    );
    expect(callback.searchParams.get('farm_reference')).toBe(
      ivorypay.createPayment.mock.calls[0][0].reference,
    );
  });

  it('persists IvoryPay identifiers so provider callback references can be resolved', async () => {
    const { service, ivorypay, prisma } = createService();
    ivorypay.createPayment.mockResolvedValue({
      payment_link: 'https://checkout.ivorypay.io/reference',
      providerReference: 'provider-reference',
      providerTransactionId: 'transaction-id',
      providerIdentifiers: {
        transaction_id: 'transaction-id',
        payment_id: 'payment-id',
        checkout_id: 'checkout-id',
        provider_reference: 'provider-reference',
        payment_reference: 'payment-reference',
      },
    });

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'crypto',
      guestEmail: 'customer@example.com',
    });

    expect(prisma.transactions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: expect.objectContaining({
            provider_transaction_id: 'transaction-id',
            provider_payment_id: 'payment-id',
            provider_checkout_id: 'checkout-id',
            provider_reference: 'provider-reference',
            payment_reference: 'payment-reference',
          }),
        },
      }),
    );
  });

  it('chooses an active IvoryPay token and network when none are supplied', async () => {
    const { service, ivorypay } = createService();

    await service.initialize({
      merchantId: merchant.id,
      amount: 100,
      method: 'crypto',
      guestEmail: 'customer@example.com',
    });

    expect(ivorypay.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        crypto: 'USDC',
        chain: 'POLYGON',
      }),
    );
  });

  it('rejects a crypto network that is not active for the selected token', async () => {
    const { service, ivorypay, prisma } = createService();

    await expect(
      service.initialize({
        merchantId: merchant.id,
        amount: 100,
        method: 'crypto',
        guestEmail: 'customer@example.com',
        crypto: 'USDC',
        chain: 'BSC',
      }),
    ).rejects.toThrow(
      'The selected crypto token and network are not enabled for IvoryPay',
    );

    expect(ivorypay.createPayment).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('QrPaymentsService settlement', () => {
  const reference = 'QR-123-payment';

  it('resolves IvoryPay callback IDs and verifies against the internal transaction', async () => {
    const internalReference = 'internal-ivory-reference';
    const payment = {
      id: 'transaction-1',
      transaction_reference: internalReference,
      status: 'pending',
      transaction_type: 'merchant_payment',
      metadata: {
        provider: 'ivorypay',
        provider_ref: 'provider-transaction-id',
        provider_checkout_id: 'provider-checkout-id',
        amount_fiat: 100,
        amount_usd: 1,
      },
      qr_payments: [{ merchant_id: 'merchant-1' }],
    };
    const prisma: any = {
      transactions: {
        findFirst: jest.fn().mockResolvedValue(payment),
        findUnique: jest.fn().mockResolvedValue({
          id: 'transaction-1',
          status: 'completed',
        }),
      },
      qr_payments: {
        findFirst: jest.fn().mockResolvedValue({ merchant_id: 'merchant-1' }),
      },
      merchants: {
        findUnique: jest.fn().mockResolvedValue({ business_name: 'Farm Shop' }),
      },
    };
    const ivorypay = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        amount: 1,
        currency: 'USD',
      }),
    };
    const service = new QrPaymentsService(
      prisma,
      {} as any,
      ivorypay as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const complete = jest
      .spyOn(service, 'complete')
      .mockResolvedValue(true);

    await expect(service.verify('provider-checkout-id')).resolves.toEqual({
      data: {
        status: 'completed',
        business_name: 'Farm Shop',
        amount: 100,
        currency: 'KES',
      },
    });
    expect(prisma.transactions.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  metadata: {
                    path: ['provider_checkout_id'],
                    equals: 'provider-checkout-id',
                  },
                }),
              ]),
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  AND: expect.arrayContaining([
                    expect.objectContaining({
                      transaction_type: 'merchant_payment',
                    }),
                    expect.objectContaining({
                      qr_payments: {
                        some: { merchant_id: { not: null } },
                      },
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(ivorypay.verifyTransaction).toHaveBeenCalledWith(
      internalReference,
      'provider-transaction-id',
      expect.arrayContaining([
        'provider-transaction-id',
        'provider-checkout-id',
      ]),
    );
    expect(complete).toHaveBeenCalledWith(
      internalReference,
      'ivorypay',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('recovers a failed but unsettled crypto payment after IvoryPay confirms success', async () => {
    const internalReference = 'failed-ivory-reference';
    const payment = {
      id: 'transaction-2',
      transaction_reference: internalReference,
      status: 'failed',
      metadata: {
        type: 'qr_sale',
        isQrSale: true,
        provider: 'ivorypay',
        provider_ref: 'provider-transaction-id',
        amount_fiat: 100,
        amount_usd: 1,
      },
    };
    const prisma: any = {
      transactions: {
        findFirst: jest.fn().mockResolvedValue(payment),
        findUnique: jest.fn().mockResolvedValue({
          id: 'transaction-2',
          status: 'completed',
        }),
      },
      qr_payments: {
        findFirst: jest.fn().mockResolvedValue({ merchant_id: 'merchant-1' }),
      },
      merchants: {
        findUnique: jest.fn().mockResolvedValue({ business_name: 'Farm Shop' }),
      },
    };
    const ivorypay = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        amount: 1,
        currency: 'USD',
      }),
    };
    const service = new QrPaymentsService(
      prisma,
      {} as any,
      ivorypay as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const complete = jest.spyOn(service, 'complete').mockResolvedValue(true);

    await service.verify('provider-transaction-id');

    expect(complete).toHaveBeenCalledWith(
      internalReference,
      'ivorypay',
      expect.objectContaining({ status: 'SUCCESS' }),
    );
  });

  it('settles successful Paystack verification and reports completed status', async () => {
    const pendingTransaction = {
      id: 'transaction-1',
      transaction_reference: reference,
      status: 'pending',
      metadata: {
        type: 'qr_sale',
        isQrSale: true,
        provider: 'paystack',
        provider_ref: reference,
        amount_fiat: 100,
      },
    };
    const prisma: any = {
      transactions: {
        findFirst: jest.fn().mockResolvedValue(pendingTransaction),
        findUnique: jest.fn().mockResolvedValue({
          id: 'transaction-1',
          status: 'completed',
        }),
      },
      qr_payments: {
        findFirst: jest.fn().mockResolvedValue({ merchant_id: 'merchant-1' }),
      },
      merchants: {
        findUnique: jest.fn().mockResolvedValue({ business_name: 'Farm Shop' }),
      },
    };
    const paystack = {
      verifyTransaction: jest.fn().mockResolvedValue({
        status: 'success',
        reference,
        amount: 10_000,
      }),
    };
    const service = new QrPaymentsService(
      prisma,
      paystack as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const complete = jest.spyOn(service, 'complete').mockResolvedValue(true);

    await expect(service.verify(reference)).resolves.toEqual({
      data: {
        status: 'completed',
        business_name: 'Farm Shop',
        amount: 100,
        currency: 'KES',
      },
    });
    expect(paystack.verifyTransaction).toHaveBeenCalledWith(reference);
    expect(complete).toHaveBeenCalledWith(reference, 'paystack', {
      status: 'success',
      reference,
      amount: 10_000,
    });
  });

  it.each(['ANYID', 'f.'])(
    'rejects invalid public merchant ID %s without querying Prisma',
    async (merchantId) => {
      const findUnique = jest.fn();
      const service = new QrPaymentsService(
        { merchants: { findUnique } } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(service.getPublicMerchant(merchantId)).rejects.toThrow(
        'Invalid merchant ID from QR',
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('returns not found for a valid but unknown public merchant ID', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = new QrPaymentsService(
      { merchants: { findUnique } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getPublicMerchant('00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Merchant not found or unable to accept payments');
  });

  it('credits the merchant wallet once for a verified Paystack payment', async () => {
    const transaction = {
      id: 'transaction-1',
      amount: 7.5,
      receiver_wallet_id: 'wallet-1',
      transaction_type: 'merchant_payment',
      metadata: {
        provider: 'paystack',
        amount_fiat: 100,
      },
      qr_payments: [{ merchant_id: 'merchant-1' }],
    };
    const tx = {
      transactions: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wallets: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'wallet-1',
            user_id: 'owner-1',
            balance: 12.5,
          }),
        update: jest.fn().mockResolvedValue({ balance: 20 }),
      },
      ledger_entries: { create: jest.fn().mockResolvedValue({}) },
      qr_payments: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      merchants: { update: jest.fn().mockResolvedValue({}) },
      users: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'superadmin-1',
          wallets: [{ id: 'superadmin-wallet-1', balance: 100 }],
        }),
      },
    };
    const prisma: any = {
      transactions: { findUnique: jest.fn().mockResolvedValue(transaction) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const cache = {
      invalidateWallet: jest.fn().mockResolvedValue(undefined),
      cacheDelete: jest.fn().mockResolvedValue(undefined),
      cacheInvalidatePattern: jest.fn().mockResolvedValue(undefined),
    };
    const websocket = {
      emitBalanceUpdate: jest.fn(),
      emitTransactionUpdate: jest.fn(),
    };
    const notifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    const receipts = {
      createForTransaction: jest
        .fn()
        .mockResolvedValue({ id: 'receipt-1' }),
      enqueuePdfAndEmail: jest.fn(),
    };
    const service = new QrPaymentsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
      websocket as any,
      notifications as any,
      receipts as any,
    );

    const settled = await service.complete(reference, 'paystack', {
      status: 'success',
      reference,
      amount: 10_000,
    });
    tx.transactions.updateMany.mockResolvedValue({ count: 0 });
    const duplicate = await service.complete(reference, 'paystack', {
      status: 'success',
      reference,
      amount: 10_000,
    });

    expect(settled).toBe(true);
    expect(duplicate).toBe(false);
    expect(tx.wallets.update).toHaveBeenCalledTimes(2);
    expect(tx.wallets.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: { increment: 7.425 } },
      select: { balance: true },
    });
    expect(tx.wallets.update).toHaveBeenCalledWith({
      where: { id: 'superadmin-wallet-1' },
      data: { balance: { increment: 0.075 } },
      select: { balance: true },
    });
    expect(tx.transactions.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          fee: 0.075,
          net_amount: 7.425,
          description: 'Public QR merchant payment',
        }),
      }),
    );
    expect(tx.ledger_entries.create).toHaveBeenCalledTimes(2);
    expect(tx.merchants.update).toHaveBeenCalledTimes(1);
    expect(receipts.createForTransaction).toHaveBeenCalledWith(
      tx,
      'transaction-1',
      'merchant-1',
      7.5,
      expect.any(Date),
      0.075,
    );
    expect(receipts.enqueuePdfAndEmail).toHaveBeenCalledWith('receipt-1');
    expect(cache.invalidateWallet).toHaveBeenCalledWith('owner-1');
    expect(cache.cacheInvalidatePattern).toHaveBeenCalledWith(
      'transactions:owner-1:*',
    );
    expect(cache.invalidateWallet).toHaveBeenCalledWith('superadmin-1');
    expect(cache.cacheDelete).toHaveBeenCalledWith(
      'admin:superadmin-dashboard',
    );
    expect(websocket.emitBalanceUpdate).toHaveBeenCalledWith('owner-1', 20);
    expect(
      websocket.emitBalanceUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(cache.invalidateWallet.mock.invocationCallOrder[0]);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({
        title: 'Merchant payment received',
        metadata: expect.objectContaining({
          event: 'merchant_payment_received',
          reference,
        }),
      }),
    );
  });

  it('does not settle a payment when the verified Paystack amount differs', async () => {
    const prisma: any = {
      transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'transaction-1',
          amount: 7.5,
          receiver_wallet_id: 'wallet-1',
          metadata: {
            type: 'qr_sale',
            isQrSale: true,
            provider: 'paystack',
            amount_fiat: 100,
          },
          qr_payments: [{ merchant_id: 'merchant-1' }],
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new QrPaymentsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.complete(reference, 'paystack', {
        status: 'success',
        reference,
        amount: 9_999,
      }),
    ).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
