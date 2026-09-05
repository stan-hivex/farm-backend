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
    service = new MerchantsService(prisma, qrService);
  });

  it('rejects QR access for a merchant that is still pending approval', async () => {
    prisma.merchants.findFirst.mockResolvedValue({
      id: 'merchant-1',
      user_id: 'user-1',
      status: 'pending',
      qr_code: 'payload',
    });

    await expect(service.getMerchantQr('user-1')).rejects.toThrow(
      'Merchant application is pending approval',
    );
    expect(qrService.getMerchantQr).not.toHaveBeenCalled();
  });

  it('allows fetching a QR image for an approved merchant', async () => {
    prisma.merchants.findFirst.mockResolvedValue({
      id: 'merchant-1',
      user_id: 'user-1',
      status: 'approved',
      qr_code: 'payload',
    });
    qrService.getMerchantQr.mockResolvedValue({ data: { qr_image_base64: 'abc' } });

    await expect(service.getMerchantQr('user-1')).resolves.toEqual({
      data: { qr_image_base64: 'abc' },
    });
    expect(qrService.getMerchantQr).toHaveBeenCalledWith('merchant-1');
  });
});
