import { QrService } from './qr.service';

describe('QrService merchant QR validation', () => {
  it('rejects QR validation for a merchant that is not approved', async () => {
    const prisma: any = {
      merchants: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-1',
          status: 'pending',
        }),
      },
    };
    const service = new QrService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.validate(JSON.stringify({ merchant_id: 'merchant-1' }), 'customer-1'),
    ).rejects.toThrow('Merchant is not approved to accept payments');
  });
});