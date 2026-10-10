import { NotificationsService } from './notifications.service';
import axios from 'axios';

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

    const service = new NotificationsService(prisma as any, { get: jest.fn() } as any, {} as any);
    const sendNotificationSpy = jest.spyOn(service, 'sendNotification').mockResolvedValue({ id: 'notify-1' } as any);

    await service.notifyTransfer('sender-id', 'receiver-id', 250, 'tx-123');

    expect(sendNotificationSpy).toHaveBeenCalledWith(
      'receiver-id',
      expect.objectContaining({
        title: '💰 Money Received',
        body: expect.stringContaining('John Mwangi sent you 250 FARM'),
      }),
    );
  });

  describe('NotificationsService password-reset email delivery', () => {
    const defaultConfigValues: Record<string, string | undefined> = {
      SMTP_PORT: '465',
      RESEND_API_KEY: 'test-resend-key',
      RESEND_FROM: 'FARM Support <support@farmapp.africa>',
    };
    const createService = (
      configValues: Record<string, string | undefined> = defaultConfigValues,
    ) =>
      new NotificationsService(
        {} as any,
        { get: jest.fn((key: string) => configValues[key]) } as any,
        {} as any,
      );

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('sends reset email through the Resend HTTPS API', async () => {
      const service = createService();
      const post = jest.spyOn(axios, 'post').mockResolvedValue({} as never);

      await service.sendEmailOrThrow(
        'person@example.com',
        'Reset your FARM password',
        '<p>Reset</p>',
        'Reset your password',
      );

      expect(post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        {
          from: 'FARM Support <support@farmapp.africa>',
          to: 'person@example.com',
          subject: 'Reset your FARM password',
          html: '<p>Reset</p>',
          text: 'Reset your password',
        },
        {
          headers: {
            Authorization: 'Bearer test-resend-key',
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
    });

    it('fails clearly when the Resend API key or sender is missing', async () => {
      const service = createService({
        ...defaultConfigValues,
        RESEND_API_KEY: undefined,
      });
      const post = jest.spyOn(axios, 'post');

      await expect(
        service.sendEmailOrThrow(
          'person@example.com',
          'Reset',
          '<p>Reset</p>',
          'Reset',
        ),
      ).rejects.toThrow('Transactional email API is not configured');
      expect(post).not.toHaveBeenCalled();
    });

    it('does not expose provider response details when API delivery fails', async () => {
      const service = createService();
      jest
        .spyOn(axios, 'post')
        .mockRejectedValue(new Error('provider returned private diagnostic'));

      await expect(
        service.sendEmailOrThrow(
          'person@example.com',
          'Reset',
          '<p>Reset</p>',
          'Reset',
        ),
      ).rejects.toThrow('Transactional email provider request failed');
    });
  });
});
