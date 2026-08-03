import { MerchantsService } from './merchants.service';

describe('MerchantsService QR access', () => {
  let service: MerchantsService;
  let prisma: any;
  let qrService: any;

  beforeEach(() => {
    prisma = {
      merchants: {
        findFirst: jest.fn(),
      },
    };
    qrService = {
      generateMerchantQr: jest.fn(),
      getMerchantQr: jest.fn(),
    };
    service = new MerchantsService(prisma, qrService, { cacheGet: jest.fn(), cacheSet: jest.fn() } as any);
  });

  it('allows fetching a QR image for a merchant that is still pending approval', async () => {
    prisma.merchants.findFirst.mockResolvedValue({
      id: 'merchant-1',
      user_id: 'user-1',
      status: 'pending',
      qr_code: 'payload',
    });
    qrService.getMerchantQr.mockResolvedValue({ data: { qr_image_base64: 'abc' } });

    await expect(service.getMerchantQr('user-1')).resolves.toEqual({
      data: { qr_image_base64: 'abc' },
    });
    expect(qrService.getMerchantQr).toHaveBeenCalledWith('merchant-1');
  });
});
