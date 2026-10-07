import { AdminService } from './admin.service';

describe('AdminService.broadcastNotification', () => {
  it('maps the audience selector to the correct user filter and sends a notification', async () => {
    const prisma = {
      users: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1', email: 'u@example.com', phone: '+254700000000' }]),
      },
      audit_logs: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      createInApp: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      sendPush: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
      sendSms: jest.fn().mockResolvedValue(true),
    };

    const service = new AdminService(
      prisma as any,
      {} as any,
      notifications as any,
      {} as any,
    );

    await service.broadcastNotification('admin-1', {
      title: 'Platform notice',
      body: 'This is a test announcement',
      audience: 'verified',
    } as any);

    expect(prisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          is_deleted: false,
          is_active: true,
          kyc_status: 'verified',
        }),
      }),
    );
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'Platform notice', body: 'This is a test announcement' }),
    );
  });

  describe('AdminService.resolveDispute', () => {
    const makeService = (escrow: any) => {
      const prisma = {
        escrow_contracts: { findUnique: jest.fn().mockResolvedValue(escrow) },
        audit_logs: { create: jest.fn().mockResolvedValue({}) },
      };
      const escrowService = {
        executeRelease: jest.fn().mockResolvedValue(undefined),
        executeRefund: jest.fn().mockResolvedValue(undefined),
      };
      const service = new AdminService(
        prisma as any,
        escrowService as any,
        {} as any,
        {} as any,
        {} as any,
      );
      return { service, prisma, escrowService };
    };

    it('refunds the buyer when an admin resolves a dispute in their favor', async () => {
      const { service, escrowService, prisma } = makeService({
        id: 'escrow-1',
        status: 'disputed',
      });

      await service.resolveDispute('escrow-1', 'admin-1', {
        winner: 'buyer',
        note: 'Seller did not deliver',
      });

      expect(escrowService.executeRefund).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'escrow-1' }),
        { adminId: 'admin-1', note: 'Seller did not deliver' },
      );
      expect(escrowService.executeRelease).not.toHaveBeenCalled();
      expect(prisma.audit_logs.create).toHaveBeenCalled();
    });

    it('releases funds to the seller when an admin resolves in their favor', async () => {
      const { service, escrowService } = makeService({
        id: 'escrow-1',
        status: 'disputed',
      });

      await service.resolveDispute('escrow-1', 'admin-1', {
        winner: 'seller',
        note: 'Delivery confirmed',
      });

      expect(escrowService.executeRelease).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'escrow-1' }),
        { adminId: 'admin-1', note: 'Delivery confirmed' },
      );
      expect(escrowService.executeRefund).not.toHaveBeenCalled();
    });

    it('does not resolve an escrow unless it is disputed', async () => {
      const { service, escrowService, prisma } = makeService({
        id: 'escrow-1',
        status: 'active',
      });

      await expect(
        service.resolveDispute('escrow-1', 'admin-1', {
          winner: 'seller',
          note: 'Not a dispute',
        }),
      ).rejects.toThrow('Only disputed escrows can be resolved');

      expect(escrowService.executeRelease).not.toHaveBeenCalled();
      expect(escrowService.executeRefund).not.toHaveBeenCalled();
      expect(prisma.audit_logs.create).not.toHaveBeenCalled();
    });
  });

  it('sends to explicitly supplied recipients when recipient IDs are provided', async () => {
    const prisma = {
      users: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-2', email: 'user2@example.com', phone: '+254700000001' }]),
      },
      audit_logs: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'notif-2' }),
      createInApp: jest.fn().mockResolvedValue({ id: 'notif-2' }),
      sendPush: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
      sendSms: jest.fn().mockResolvedValue(true),
    };

    const service = new AdminService(
      prisma as any,
      {} as any,
      notifications as any,
      {} as any,
    );

    await service.broadcastNotification('admin-1', {
      title: 'Direct notice',
      body: 'Sent to selected recipients',
      recipientIds: ['user-2'],
    } as any);

    expect(prisma.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ id: { in: ['user-2'] } }],
        }),
      }),
    );
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ title: 'Direct notice', body: 'Sent to selected recipients' }),
    );
  });
});
