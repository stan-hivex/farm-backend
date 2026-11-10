import { Test } from '@nestjs/testing';
import { PaymentRequestsService } from './payment-requests.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

describe('PaymentRequestsService', () => {
  let service: PaymentRequestsService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      payment_requests: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      wallets: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      users: {
        findFirst: jest.fn(),
      },
    };

    prisma.$transaction = jest.fn(async (cb) => cb(prisma));

    notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PaymentRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: {} },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: WebsocketGateway,
          useValue: {
            emitBalanceUpdate: jest.fn(),
            emitTransactionUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentRequestsService);
  });

  it('keeps a created request successful when notification delivery fails', async () => {
    prisma.wallets.findFirst.mockResolvedValue({ id: 'requester-wallet' });
    prisma.users.findFirst.mockResolvedValue({
      id: 'recipient-user',
      wallets: [{ id: 'recipient-wallet' }],
    });
    prisma.payment_requests.create.mockResolvedValue({
      id: 'request-1',
      users_requester: { id: 'requester-user', username: 'requester' },
      users_recipient: { id: 'recipient-user' },
    });
    notifications.sendNotification.mockRejectedValue(
      new Error('Push delivery failed'),
    );

    await expect(
      service.createRequest(
        'requester-user',
        { recipient_identifier: 'recipient', amount: 50 },
        '',
      ),
    ).resolves.toMatchObject({
      data: { request_id: 'request-1', status: 'pending', amount: 50 },
      message: 'Payment request created successfully',
    });
  });

  it('marks pending requests as expired and notifies users', async () => {
    const now = new Date();
    // return one expired request (expires_at in the past)
    const expiredReq = {
      id: 'req-1',
      requester_user_id: 'user-A',
      recipient_user_id: 'user-B',
      amount: 42,
      status: 'pending',
      expires_at: new Date(now.getTime() - 1000 * 60),
    };

    prisma.payment_requests.findMany.mockResolvedValue([expiredReq]);
    prisma.payment_requests.update.mockResolvedValue({
      ...expiredReq,
      status: 'expired',
    });

    const processed = await service.processExpiredRequests();

    expect(processed).toBe(1);
    expect(prisma.payment_requests.update).toHaveBeenCalledWith({
      where: { id: expiredReq.id },
      data: { status: 'expired' },
    });

    // Two notifications should be attempted: requester and recipient
    expect(notifications.sendNotification).toHaveBeenCalled();
    // at least one call for requester_user_id and one for recipient_user_id
    const receivers = notifications.sendNotification.mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(receivers).toEqual(expect.arrayContaining(['user-A', 'user-B']));
  });
});
