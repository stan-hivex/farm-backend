import { QrPaymentsService } from './qr-payments.service';

describe('QrPaymentsService hosted NOWPayments checkout', () => {
  it('lets the hosted invoice show all supported currencies and records the requested preference separately', async () => {
    const transactionCreate = jest.fn().mockResolvedValue({ id: 'tx-1' });
    const invoice = {
      invoice_id: 'invoice-1',
      invoice_url: 'https://nowpayments.io/payment?iid=invoice-1',
    };
    const nowpayments = {
      getAvailableCurrencies: jest.fn().mockResolvedValue(['btc', 'usdttrc20']),
      createInvoice: jest.fn().mockResolvedValue(invoice),
    };
    const prisma = {
      merchants: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-1',
          user_id: 'owner-1',
          status: 'approved',
          business_name: 'Farm Shop',
          business_email: 'shop@example.com',
          qr_code: '{"merchant_id":"merchant-1"}',
          users_merchants_user_idTousers: { email: 'owner@example.com' },
        }),
      },
      wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      $transaction: jest.fn((callback) =>
        callback({
          transactions: { create: transactionCreate },
          qr_payments: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
      transactions: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new QrPaymentsService(
      prisma as any,
      {} as any,
      {} as any,
      {
        getCurrentRate: jest.fn().mockResolvedValue({
          farm_kes_rate: 130,
          farm_usd_rate: 1.3,
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      { createForTransaction: jest.fn(), enqueuePdfAndEmail: jest.fn() } as any,
      nowpayments as any,
    );

    await service.initialize({
      merchantId: 'merchant-1',
      amount: 100,
      method: 'crypto',
      guestEmail: 'customer@example.com',
      crypto: 'usdttrc20',
    });

    expect(nowpayments.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        priceCurrency: 'usd',
        orderId: expect.stringMatching(/^QR-/),
      }),
    );
    expect(nowpayments.createInvoice.mock.calls[0][0]).not.toHaveProperty(
      'payCurrency',
    );
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            requested_crypto: 'usdttrc20',
          }),
        }),
      }),
    );
    expect(transactionCreate.mock.calls[0][0].data.metadata).not.toHaveProperty(
      'crypto',
    );
  });

  it('credits the merchant for an authenticated provider-selected coin', async () => {
    const reference = 'QR-dynamic-currency';
    const transaction = {
      id: 'tx-2',
      transaction_reference: reference,
      amount: 7.5,
      receiver_wallet_id: 'merchant-wallet',
      transaction_type: 'merchant_payment',
      status: 'pending',
      metadata: {
        type: 'qr_sale',
        isQrSale: true,
        provider: 'nowpayments',
        amount_usd: 10,
      },
      qr_payments: [{ merchant_id: 'merchant-1' }],
    };
    const transactionUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const merchantWalletUpdate = jest
      .fn()
      .mockResolvedValue({ balance: 7.425 });
    const superadminWalletUpdate = jest
      .fn()
      .mockResolvedValue({ balance: 1.075 });
    const tx = {
      transactions: { updateMany: transactionUpdate },
      wallets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-wallet',
          user_id: 'merchant-owner',
          balance: 0,
        }),
        update: jest
          .fn()
          .mockImplementationOnce(merchantWalletUpdate)
          .mockImplementationOnce(superadminWalletUpdate),
      },
      ledger_entries: { create: jest.fn().mockResolvedValue({}) },
      users: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'superadmin',
          wallets: [{ id: 'superadmin-wallet', balance: 1 }],
        }),
      },
      qr_payments: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      merchants: { update: jest.fn().mockResolvedValue({}) },
    };
    const cache = {
      invalidateWallet: jest.fn().mockResolvedValue(undefined),
      cacheDelete: jest.fn().mockResolvedValue(undefined),
      cacheInvalidatePattern: jest.fn().mockResolvedValue(undefined),
    };
    const receipts = {
      createForTransaction: jest.fn().mockResolvedValue({ id: 'receipt-2' }),
      enqueuePdfAndEmail: jest.fn(),
    };
    const service = new QrPaymentsService(
      {
        transactions: { findUnique: jest.fn().mockResolvedValue(transaction) },
        $transaction: jest.fn((callback) => callback(tx)),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
      {
        emitBalanceUpdate: jest.fn(),
        emitTransactionUpdate: jest.fn(),
      } as any,
      { sendNotification: jest.fn().mockResolvedValue(undefined) } as any,
      receipts as any,
      {} as any,
    );

    await expect(
      service.complete(reference, 'nowpayments', {
        payment_status: 'finished',
        order_id: reference,
        pay_currency: 'btc',
        price_currency: 'usd',
        price_amount: 10,
      }),
    ).resolves.toBe(true);

    expect(merchantWalletUpdate).toHaveBeenCalledWith({
      where: { id: 'merchant-wallet' },
      data: { balance: { increment: 7.425 } },
      select: { balance: true },
    });
    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-2', status: { in: ['pending', 'failed'] } },
      }),
    );
    expect(tx.qr_payments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'completed' } }),
    );
  });
});
