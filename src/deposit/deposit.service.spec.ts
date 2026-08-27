import { Test } from '@nestjs/testing';
import { DepositService } from './deposit.service';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CacheService } from '../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';

describe('DepositService', () => {
  let service: DepositService;
  let prisma: any;
  let ivorypay: any;
  let paystack: any;
  let websocket: any;
  let cache: any;
  let notifications: any;
  let currencyConversion: any;

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
    currencyConversion = {};

    const module = await Test.createTestingModule({
      providers: [
        DepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaystackService, useValue: paystack },
        { provide: IvorypayService, useValue: ivorypay },
        { provide: WebsocketGateway, useValue: websocket },
        { provide: CacheService, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
        { provide: CurrencyConversionService, useValue: currencyConversion },
      ],
    }).compile();

    service = module.get(DepositService);
  });

  it('rejects crypto deposits on the generic deposit endpoint', async () => {
    await expect(service.createDeposit('user-1', {
      amount_fiat: 1,
      paymentMethod: 'CRYPTO',
      email: 'user@example.com',
    })).rejects.toThrow('dedicated /api/v1/crypto/deposit endpoint');
  });

  it('does not create a generic deposit for crypto requests', async () => {
    await expect(service.createDeposit('user-2', {
      amount_fiat: 2,
      paymentMethod: 'CRYPTO',
      email: 'user2@example.com',
    })).rejects.toThrow('dedicated /api/v1/crypto/deposit endpoint');
    expect(prisma.deposit.create).not.toHaveBeenCalled();
  });

  it('charges card deposits only the amount entered by the user', async () => {
    paystack.initializePayment = jest.fn().mockResolvedValue({
      authorization_url: 'https://checkout.example.test/payment',
    });
    prisma.deposit.create.mockResolvedValue({
      id: 'deposit-1',
      amount: 10,
      fee: 0,
      total: 10,
      currency: 'KES',
      paymentMethod: 'CARD',
      provider: 'paystack',
      reference: 'reference-1',
      status: 'PENDING',
    });

    const result = await service.createDeposit('user-1', {
      amount_fiat: 10,
      currency: 'KES',
      paymentMethod: 'CARD',
      email: 'user@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10 }),
    );
    expect(prisma.deposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 10, fee: 0, total: 10 }),
      }),
    );
    expect(result.deposit.fee).toBe(0);
    expect(result.deposit.total).toBe(10);
  });
});
