import { AdminService } from './admin.service';

describe('AdminService', () => {
  const createCacheStub = () => ({
    cacheGet: jest.fn(),
    cacheSet: jest.fn(),
    cacheDelete: jest.fn(),
    cacheInvalidatePattern: jest.fn(),
  });

  it('caches exchange rates and reuses them on repeated reads', async () => {
    const prisma = {
      exchange_rates: {
        findMany: jest.fn().mockResolvedValue([{ base_currency: 'USD', target_currency: 'FARM', rate: 130 }]),
      },
    };
    const cache = createCacheStub();
    cache.cacheGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: [{ base_currency: 'USD', target_currency: 'FARM', rate: 130 }] });

    const service = new AdminService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
    );

    const first = await service.getExchangeRates();
    const second = await service.getExchangeRates();

    expect(first).toEqual({ data: [{ base_currency: 'USD', target_currency: 'FARM', rate: 130 }] });
    expect(second).toEqual(first);
    expect(prisma.exchange_rates.findMany).toHaveBeenCalledTimes(1);
    expect(cache.cacheSet).toHaveBeenCalledWith('exchange-rates:all', expect.any(Object), 300);
  });

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
      createCacheStub() as any,
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
      createCacheStub() as any,
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
