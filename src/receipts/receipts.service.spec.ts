import { NotFoundException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

describe('ReceiptsService merchant ownership', () => {
  it('stores the merchant sales fee on the generated receipt', async () => {
    const receipt = { id: 'receipt-1' };
    const tx = {
      payment_receipts: {
        create: jest.fn().mockResolvedValue(receipt),
      },
    };
    const service = new ReceiptsService(
      {} as any,
      {} as any,
      {} as any,
    );
    const createdAt = new Date('2026-10-13T10:00:00Z');

    await expect(
      service.createForTransaction(
        tx as any,
        'transaction-1',
        'merchant-1',
        100,
        createdAt,
        1,
      ),
    ).resolves.toBe(receipt);
    expect(tx.payment_receipts.create).toHaveBeenCalledWith({
      data: {
        receipt_number: 'FARM-2026-TRANSACTION-1',
        transaction_id: 'transaction-1',
        merchant_id: 'merchant-1',
        amount: 100,
        fee: 1,
        created_at: createdAt,
      },
    });
  });

  it('lists only receipts belonging to the authenticated user merchant', async () => {
    const prisma = {
      merchants: {
        findFirst: jest.fn().mockResolvedValue({ id: 'merchant-1' }),
      },
      payment_receipts: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'receipt-1',
            receipt_number: 'FARM-2026-tx-1',
            transaction_id: 'tx-1',
            merchant_id: 'merchant-1',
            amount: 12.5,
            fee: 0,
            pdf_url: null,
            created_at: new Date('2026-10-13T10:00:00Z'),
            transactions: {
              transaction_reference: 'QR-reference',
              status: 'completed',
              currency: 'FARM',
              metadata: { guest_email: 'customer@example.com' },
            },
            merchants: { business_name: 'Farm Shop' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ReceiptsService(
      prisma as any,
      {} as any,
      {} as any,
    );

    const result = await service.listForMerchantOwner('owner-1', {
      page: 1,
      limit: 20,
    });

    expect(prisma.merchants.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'owner-1' },
      select: { id: true },
    });
    expect(prisma.payment_receipts.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchant_id: 'merchant-1' } }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'receipt-1',
        payer_email: 'customer@example.com',
        merchant_name: 'Farm Shop',
        amount: 12.5,
      }),
    );
  });

  it('does not expose a receipt owned by another merchant', async () => {
    const prisma = {
      payment_receipts: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new ReceiptsService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getForMerchantOwner('owner-1', 'receipt-from-another-merchant'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payment_receipts.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'receipt-from-another-merchant',
          merchants: { user_id: 'owner-1' },
        },
      }),
    );
  });

  it('reports when a public QR receipt PDF is still being generated', async () => {
    const prisma = {
      payment_receipts: {
        findFirst: jest.fn().mockResolvedValue({
          receipt_number: 'FARM-2026-TRANSACTION-1',
          pdf_url: null,
        }),
      },
    };
    const service = new ReceiptsService(
      prisma as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getPublicDownloadUrlForTransaction('transaction-1'),
    ).rejects.toThrow('The receipt PDF is still being generated');
    expect(prisma.payment_receipts.findFirst).toHaveBeenCalledWith({
      where: { transaction_id: 'transaction-1' },
      select: { receipt_number: true, pdf_url: true },
    });
  });
});
