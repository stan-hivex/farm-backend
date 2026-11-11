import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BusinessService } from './business.service';

function completeBusiness(overrides: any = {}) {
  return {
    id: 'biz-1',
    owner_user_id: 'user-1',
    status: 'draft',
    legal_name: 'Acme Ltd',
    registration_number: 'PVT-123',
    registration_country: 'KE',
    sector: 'agriculture',
    country: 'Kenya',
    address: '1 Road',
    business_email: 'a@acme.co',
    business_phone: '+254700000000',
    persons: [
      { role: 'director', full_name: 'Jane' },
      { role: 'beneficial_owner', full_name: 'John', ownership_percent: 60 },
    ],
    documents: [
      { doc_type: 'certificate_of_incorporation', file_url: 'https://x/a.png' },
      { doc_type: 'proof_of_address', file_url: 'https://x/b.png' },
    ],
    verifications: [],
    ...overrides,
  };
}

describe('BusinessService', () => {
  let prisma: any;
  let svc: BusinessService;

  beforeEach(() => {
    prisma = {
      businesses: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      merchants: { findFirst: jest.fn() },
      business_persons: { deleteMany: jest.fn(), createMany: jest.fn() },
      business_documents: { deleteMany: jest.fn(), createMany: jest.fn() },
      business_verifications: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      notifications: { create: jest.fn() },
      audit_logs: { create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    svc = new BusinessService(prisma);
  });

  describe('upgradeFromMerchant', () => {
    it('requires a merchant record', async () => {
      prisma.businesses.findUnique.mockResolvedValue(null);
      prisma.merchants.findFirst.mockResolvedValue(null);
      await expect(svc.upgradeFromMerchant('user-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('requires an approved merchant', async () => {
      prisma.businesses.findUnique.mockResolvedValue(null);
      prisma.merchants.findFirst.mockResolvedValue({
        id: 'm1',
        status: 'pending',
      });
      await expect(svc.upgradeFromMerchant('user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates a Draft prefilled from the merchant, never approved', async () => {
      prisma.businesses.findUnique.mockResolvedValue(null);
      prisma.merchants.findFirst.mockResolvedValue({
        id: 'm1',
        status: 'approved',
        business_name: 'Acme',
        business_email: 'a@acme.co',
        country: 'Kenya',
      });
      prisma.businesses.create.mockImplementation(({ data }: any) => ({
        ...data,
        persons: [],
        documents: [],
      }));
      const res = await svc.upgradeFromMerchant('user-1');
      const data = prisma.businesses.create.mock.calls[0][0].data;
      expect(data.status).toBe('draft');
      expect(data.merchant_id).toBe('m1');
      expect(data.legal_name).toBe('Acme');
      expect(res.data.status).toBe('draft');
    });

    it('is idempotent when a business already exists', async () => {
      prisma.businesses.findUnique.mockResolvedValue(
        completeBusiness({ status: 'under_review' }),
      );
      const res = await svc.upgradeFromMerchant('user-1');
      expect(prisma.businesses.create).not.toHaveBeenCalled();
      expect(res.data.status).toBe('under_review');
    });
  });

  describe('saveDraft', () => {
    it('blocks edits while under review', async () => {
      prisma.businesses.findUnique.mockResolvedValue({
        id: 'biz-1',
        status: 'under_review',
      });
      await expect(
        svc.saveDraft('user-1', { legal_name: 'X' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('blocks edits once approved', async () => {
      prisma.businesses.findUnique.mockResolvedValue({
        id: 'biz-1',
        status: 'approved',
      });
      await expect(
        svc.saveDraft('user-1', { legal_name: 'X' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('replaces persons and documents and moves rejected back to draft', async () => {
      prisma.businesses.findUnique.mockResolvedValue({
        id: 'biz-1',
        status: 'rejected',
      });
      prisma.businesses.update.mockResolvedValue(completeBusiness());
      await svc.saveDraft('user-1', {
        legal_name: 'Acme',
        persons: [{ role: 'director', full_name: 'Jane' }],
        documents: [
          { doc_type: 'proof_of_address', file_url: 'https://x/b.png' },
        ],
      });
      expect(prisma.business_persons.deleteMany).toHaveBeenCalledWith({
        where: { business_id: 'biz-1' },
      });
      expect(prisma.business_persons.createMany).toHaveBeenCalled();
      expect(prisma.business_documents.createMany).toHaveBeenCalled();
      expect(prisma.businesses.update.mock.calls[0][0].data.status).toBe(
        'draft',
      );
    });
  });

  describe('submit', () => {
    it('refuses to continue before a Didit session has been started', async () => {
      prisma.businesses.findUnique.mockResolvedValue(completeBusiness());
      await expect(svc.submit('user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns an already submitted Didit application without a manual decision', async () => {
      prisma.businesses.findUnique.mockResolvedValue(
        completeBusiness({
          status: 'under_review',
          didit_kyb_session_id: 'didit-session',
        }),
      );
      const res = await svc.submit('user-1');
      expect(res.data.status).toBe('under_review');
      expect(prisma.businesses.updateMany).not.toHaveBeenCalled();
      expect(prisma.business_verifications.create).not.toHaveBeenCalled();
    });

    it('returns an already Didit-approved business', async () => {
      prisma.businesses.findUnique.mockResolvedValue(
        completeBusiness({
          status: 'approved',
          didit_kyb_session_id: 'didit-session',
        }),
      );
      const res = await svc.submit('user-1');
      expect(res.data.status).toBe('approved');
    });
  });
});
