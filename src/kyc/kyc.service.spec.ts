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
      document_number: 'ID-12345',
      front_image_url: submitted.front_image_url,
      back_image_url: submitted.back_image_url,
      selfie_image_url: submitted.selfie_image_url,
      address_document_url: submitted.address_document,
      first_name: 'Ada',
      last_name: 'Lovelace',
      date_of_birth: '1990-12-10',
      gender: 'Female',
      nationality: 'Kenyan',
      phone_number: '+254700000000',
      email: 'ada@example.com',
      country: 'Kenya',
      state: 'Nairobi County',
      city: 'Nairobi',
      address: '110 Example Road',
      postal_code: '10106',
    });

    expect(prisma.kyc_documents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        document_type: 'National ID',
        document_number: 'ID-12345',
        front_image: submitted.front_image_url,
        front_image_url: submitted.front_image_url,
        back_image: submitted.back_image_url,
        back_image_url: submitted.back_image_url,
        selfie_image: submitted.selfie_image_url,
        selfie_image_url: submitted.selfie_image_url,
        address_document: submitted.address_document,
        first_name: 'Ada',
        last_name: 'Lovelace',
        date_of_birth: new Date('1990-12-10T00:00:00.000Z'),
        gender: 'Female',
        nationality: 'Kenyan',
        phone: '+254700000000',
        email: 'ada@example.com',
        country: 'Kenya',
        county: 'Nairobi County',
        city: 'Nairobi',
        physical_address: '110 Example Road',
        postal_code: '10106',
      }),
    });
  });

  it('rejects invalid dates of birth before attempting to save', async () => {
    const prisma: any = {
      users: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      kyc_documents: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const notifications = { sendNotification: jest.fn() };
    const service = new KycService(prisma, notifications as any);

    await expect(
      service.submit('user-1', {
        date_of_birth: '2024-02-30',
      }),
    ).rejects.toThrow('Invalid date of birth');
    expect(prisma.kyc_documents.create).not.toHaveBeenCalled();
  });
});
