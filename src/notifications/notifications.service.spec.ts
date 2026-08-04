import { NotificationsService } from './notifications.service';

describe('NotificationsService.notifyTransfer', () => {
  it('builds a richer transfer-received notification with sender and balance details', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'sender-id') {
            return Promise.resolve({ id: 'sender-id', first_name: 'John', last_name: 'Mwangi', username: 'john' });
          }
          return Promise.resolve({ id: 'receiver-id', first_name: 'Grace', last_name: 'Njeri', username: 'grace' });
        }),
      },
      wallets: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.user_id === 'sender-id') {
            return Promise.resolve({ balance: 430 });
          }
          return Promise.resolve({ balance: 680 });
        }),
      },
    };

    const service = new NotificationsService(
      prisma as any,
      { get: jest.fn() } as any,
      {} as any,
      { cacheGet: jest.fn(), cacheSet: jest.fn() } as any,
    );
    const sendNotificationSpy = jest.spyOn(service, 'sendNotification').mockResolvedValue({ id: 'notify-1' } as any);

    await service.notifyTransfer('sender-id', 'receiver-id', 250, 'tx-123');

    expect(sendNotificationSpy).toHaveBeenCalledWith(
      'receiver-id',
      expect.objectContaining({
        title: 'Money Received',
        body: expect.stringContaining('John Mwangi sent you 250 FARM'),
      }),
    );
  });
});
