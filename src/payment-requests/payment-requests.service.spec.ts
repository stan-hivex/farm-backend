import { Test } from '@nestjs/testing';
import { PaymentRequestsService } from './payment-requests.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('PaymentRequestsService - expiry processing', () => {
  let service: PaymentRequestsService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      payment_requests: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    // prisma.$transaction is not used by processExpiredRequests, but keep default shape
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
      ],
    }).compile();

    service = module.get(PaymentRequestsService);
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
    prisma.payment_requests.update.mockResolvedValue({ ...expiredReq, status: 'expired' });

    const processed = await service.processExpiredRequests();

    expect(processed).toBe(1);
    expect(prisma.payment_requests.update).toHaveBeenCalledWith({ where: { id: expiredReq.id }, data: { status: 'expired' } });

    // Two notifications should be attempted: requester and recipient
    expect(notifications.sendNotification).toHaveBeenCalled();
    const calledWith = notifications.sendNotification.mock.calls.map((c: any[]) => c[0]);
    // at least one call for requester_user_id and one for recipient_user_id
    const receivers = notifications.sendNotification.mock.calls.map((c: any[]) => c[0]);
    expect(receivers).toEqual(expect.arrayContaining(['user-A','user-B']));
  });
});
