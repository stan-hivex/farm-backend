import { Test } from '@nestjs/testing';
import { IvorypayDepositService } from './ivorypay-deposit.service';
import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from './ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

describe('IvorypayDepositService', () => {
  let service: IvorypayDepositService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      deposit: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      transactions: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      wallets: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ledger_entries: {
        create: jest.fn(),
      },
      audit_logs: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
    };

    const module = await Test.createTestingModule({
      providers: [
        IvorypayDepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: IvorypayService, useValue: { createPayment: jest.fn(), verifyTransaction: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
        { provide: WebsocketGateway, useValue: { emitBalanceUpdate: jest.fn(), emitTransactionUpdate: jest.fn() } },
      ],
    }).compile();

    service = module.get(IvorypayDepositService);
  });

  it('ignores a duplicate IvoryPay webhook when the deposit is already completed', async () => {
    prisma.deposit.findFirst.mockResolvedValue({
      id: 'dep-1',
      userId: 'user-1',
      reference: 'ref-1',
      status: 'SUCCESS',
      amount: 100,
      currency: 'FARM',
      provider: 'ivorypay',
    });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      transaction_reference: 'ref-1',
      status: 'completed',
      transaction_type: 'deposit',
      metadata: { provider: 'ivorypay' },
    });

    const result = await service.handleWebhook({
      reference: 'ref-1',
      event: 'payment.success',
      data: { status: 'completed' },
    }, true);

    expect(result).toEqual(expect.objectContaining({ processed: true, duplicate: true }));
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });
});
