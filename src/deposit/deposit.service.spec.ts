import { Test } from '@nestjs/testing';
import { DepositService } from './deposit.service';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CacheService } from '../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('DepositService', () => {
  let service: DepositService;
  let prisma: any;
  let ivorypay: any;
  let paystack: any;
  let websocket: any;
  let cache: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      deposit: {
        create: jest.fn(),
        update: jest.fn(),
      },
      transactions: {
        create: jest.fn(),
      },
      audit_logs: {
        create: jest.fn(),
      },
    };

    ivorypay = {
      createPayment: jest.fn(),
    };

    paystack = {};
    websocket = {};
    cache = {};
    notifications = {};

    const module = await Test.createTestingModule({
      providers: [
        DepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaystackService, useValue: paystack },
        { provide: IvorypayService, useValue: ivorypay },
        { provide: WebsocketGateway, useValue: websocket },
        { provide: CacheService, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(DepositService);
  });

  it('does not persist internal reference when Ivorypay returns no external provider identifiers', async () => {
    const deposit = { id: 'dep-1', amount: 1, currency: 'FARM', paymentMethod: 'CRYPTO' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-1' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://example.com/checkout' },
      providerIdentifiers: {},
    });

    const result = await service.createDeposit('user-1', {
      amount_fiat: 1,
      paymentMethod: 'CRYPTO',
      email: 'user@example.com',
    });

    expect(prisma.deposit.update).not.toHaveBeenCalled();
    expect(prisma.transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          provider_ref: null,
        }),
      }),
    }));
    expect(result.data.provider).toBe('IVORYPAY');
    expect(result.data.payment_url).toBe('https://example.com/checkout');
  });

  it('persists the Ivorypay provider transaction ID when available', async () => {
    const deposit = { id: 'dep-2', amount: 2, currency: 'FARM', paymentMethod: 'CRYPTO' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-2' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://example.com/checkout-2' },
      providerIdentifiers: { transaction_id: 'ivory-123' },
      providerReference: 'ivory-123',
    });

    const result = await service.createDeposit('user-2', {
      amount_fiat: 2,
      paymentMethod: 'CRYPTO',
      email: 'user2@example.com',
    });

    expect(prisma.deposit.update).toHaveBeenCalledWith({
      where: { id: 'dep-2' },
      data: { providerRef: 'ivory-123' },
    });
    expect(prisma.transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          provider_ref: 'ivory-123',
        }),
      }),
    }));
    expect(result.data.provider).toBe('IVORYPAY');
    expect(result.data.payment_url).toBe('https://example.com/checkout-2');
  });
});
