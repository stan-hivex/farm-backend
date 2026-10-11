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

});

describe('AdminService admin management', () => {
    it('lists only non-deleted admin accounts', async () => {
      const prisma = {
        users: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.listAdmins({ page: 1, limit: 20 });

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: 'admin', is_deleted: false },
        }),
      );
      expect(prisma.users.count).toHaveBeenCalledWith({
        where: { role: 'admin', is_deleted: false },
      });
    });

    it('keeps admin and superadmin accounts out of ordinary user lists', async () => {
      const prisma = {
        users: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.listUsers({ page: 1, limit: 20 });

      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            is_deleted: false,
            AND: [
              {
                OR: [
                  { role: { notIn: ['admin', 'super_admin'] } },
                  { role: null },
                ],
              },
            ],
          },
        }),
      );
    });

    it('revokes admin sessions when suspending an account', async () => {
      const tx = {
        users: {
          update: jest.fn().mockResolvedValue({
            id: 'admin-1',
            role: 'admin',
            is_suspended: true,
          }),
        },
        user_sessions: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        audit_logs: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        users: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-1' }) },
        $transaction: jest.fn((callback: (client: any) => unknown) =>
          callback(tx),
        ),
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.setAdminStatus('admin-1', 'suspend', 'superadmin-1');

      expect(tx.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: { is_suspended: true },
        }),
      );
      expect(tx.user_sessions.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id: 'admin-1',
            OR: [{ is_revoked: false }, { is_revoked: null }],
          },
          data: { is_revoked: true },
        }),
      );
      expect(tx.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SUSPEND_ADMIN' }),
        }),
      );
    });

    it('does not allow the ordinary user editor to assign staff roles', async () => {
      const prisma = {
        users: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            role: 'user',
            is_deleted: false,
          }),
          update: jest.fn(),
        },
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        service.updateUser('user-1', { role: 'admin' }, 'admin-1'),
      ).rejects.toThrow('Staff roles can only be managed by superadmins');
      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('excludes admin and superadmin roles from ordinary user counts', async () => {
      const prisma = {
        users: { count: jest.fn().mockResolvedValue(0) },
        merchants: { count: jest.fn().mockResolvedValue(0) },
        escrow_contracts: { count: jest.fn().mockResolvedValue(0) },
        transactions: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: 0 },
            _count: 0,
          }),
        },
        kyc_documents: { count: jest.fn().mockResolvedValue(0) },
        merchant_payouts: { count: jest.fn().mockResolvedValue(0) },
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.getDashboardStats();

      expect(prisma.users.count).toHaveBeenCalledWith({
        where: {
          is_deleted: false,
          OR: [
            { role: { notIn: ['admin', 'super_admin'] } },
            { role: null },
          ],
        },
      });
    });

    it('excludes admin and superadmin roles from the superadmin dashboard total', async () => {
      const prisma = {
        users: { count: jest.fn().mockResolvedValue(0) },
        transactions: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: 0, fee: 0 },
            _count: { id: 0 },
          }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        support_tickets: { count: jest.fn().mockResolvedValue(0) },
        escrow_contracts: { count: jest.fn().mockResolvedValue(0) },
        kyc_documents: { count: jest.fn().mockResolvedValue(0) },
      };
      const service = new AdminService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.getSuperadminDashboard();

      expect(prisma.users.count).toHaveBeenCalledWith({
        where: {
          is_deleted: false,
          OR: [
            { role: { notIn: ['admin', 'super_admin'] } },
            { role: null },
          ],
        },
      });
    });
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

describe('AdminService.broadcastNotification recipient targeting', () => {
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
