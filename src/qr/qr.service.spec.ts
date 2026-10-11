import { QrService } from './qr.service';
import { createHmac } from 'crypto';

describe('QrService merchant QR validation', () => {
  it('uses the Firebase checkout host when a backend URL is configured', () => {
    const service = new QrService(
      {} as any,
      {} as any,
      {} as any,
      { get: () => 'https://farmapp.africa/merchant-payment/' } as any,
      {} as any,
      {} as any,
    );

    const url = (service as any).checkoutUrl('{"merchant_id":"merchant-1"}');

    expect(url).toMatch(/^https:\/\/farmapp-e2145\.web\.app\/merchant-payment\/\?qr=/);
  });

  it('validates a signed merchant QR scanned from its hosted checkout URL', async () => {
    const secret = 'merchant-secret';
    const payload = {
      merchant_id: 'merchant-1',
      business_name: 'Test Merchant',
      v: 1,
    };
    const sig = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const signedPayload = JSON.stringify({ ...payload, sig });
    const qr = Buffer.from(signedPayload).toString('base64url');
    const prisma: any = {
      merchants: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-1',
          status: 'approved',
          business_name: 'Test Merchant',
          qr_secret: secret,
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
      service.validate(`https://farmapp.africa/merchant-payment/?qr=${qr}`, 'customer-1'),
    ).resolves.toMatchObject({
      data: {
        valid: true,
        type: 'merchant',
        merchant_id: 'merchant-1',
        business_name: 'Test Merchant',
      },
    });
  });

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