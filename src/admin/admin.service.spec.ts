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
