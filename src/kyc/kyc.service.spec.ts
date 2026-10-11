import { KycService } from './kyc.service';

describe('KycService', () => {
  it('persists uploaded KYC image URLs, including proof of address', async () => {
    const submitted = {
      id: 'kyc-1',
      user_id: 'user-1',
      front_image_url: 'https://res.cloudinary.com/demo/front.jpg',
      back_image_url: 'https://res.cloudinary.com/demo/back.jpg',
      selfie_image_url: 'https://res.cloudinary.com/demo/selfie.jpg',
      address_document: 'https://res.cloudinary.com/demo/address.jpg',
    };
    const prisma: any = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      kyc_documents: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'kyc-1', ...data }),
          ),
      },
    };
    const notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };
    const service = new KycService(prisma, notifications as any);

    await service.submit('user-1', {
      document_type: 'National ID',
      front_image_url: submitted.front_image_url,
      back_image_url: submitted.back_image_url,
      selfie_image_url: submitted.selfie_image_url,
      address_document_url: submitted.address_document,
    });

    expect(prisma.kyc_documents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        front_image: submitted.front_image_url,
        front_image_url: submitted.front_image_url,
        back_image: submitted.back_image_url,
        back_image_url: submitted.back_image_url,
        selfie_image: submitted.selfie_image_url,
        selfie_image_url: submitted.selfie_image_url,
        address_document: submitted.address_document,
      }),
    });
  });
});
