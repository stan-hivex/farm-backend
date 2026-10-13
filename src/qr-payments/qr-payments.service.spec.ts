import { QrPaymentsService } from './qr-payments.service';

describe('QrPaymentsService settlement', () => {
  const reference = 'QR-123-payment';

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
      metadata: {
        type: 'qr_sale',
        isQrSale: true,
        provider: 'paystack',
        amount_fiat: 100,
      },
      qr_payments: [{ merchant_id: 'merchant-1' }],
    };
    const tx = {
      transactions: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      wallets: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          user_id: 'owner-1',
          balance: 12.5,
        }),
        update: jest.fn().mockResolvedValue({ balance: 20 }),
      },
      ledger_entries: { create: jest.fn().mockResolvedValue({}) },
      qr_payments: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      merchants: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      transactions: { findUnique: jest.fn().mockResolvedValue(transaction) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const cache = { invalidateWallet: jest.fn().mockResolvedValue(undefined) };
    const websocket = {
      emitBalanceUpdate: jest.fn(),
      emitTransactionUpdate: jest.fn(),
    };
    const notifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new QrPaymentsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
      websocket as any,
      notifications as any,
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
    expect(tx.wallets.update).toHaveBeenCalledTimes(1);
    expect(tx.wallets.update).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balance: { increment: 7.5 } },
      select: { balance: true },
    });
    expect(tx.ledger_entries.create).toHaveBeenCalledTimes(1);
    expect(tx.merchants.update).toHaveBeenCalledTimes(1);
    expect(cache.invalidateWallet).toHaveBeenCalledWith('owner-1');
    expect(websocket.emitBalanceUpdate).toHaveBeenCalledWith('owner-1', 20);
    expect(websocket.emitBalanceUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      cache.invalidateWallet.mock.invocationCallOrder[0],
    );
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
