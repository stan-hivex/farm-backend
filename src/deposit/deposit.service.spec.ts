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

  it('charges mobile money deposits only the amount entered by the user', async () => {
    paystack.initializePayment = jest.fn().mockResolvedValue({
      authorization_url: 'https://checkout.example.test/payment',
    });
    prisma.deposit.create.mockResolvedValue({
      id: 'deposit-2',
      amount: 100,
      fee: 0,
      total: 100,
      currency: 'KES',
      paymentMethod: 'MOBILE_MONEY',
      provider: 'paystack',
      reference: 'reference-2',
      status: 'PENDING',
    });

    const result = await service.createDeposit('user-1', {
      amount_fiat: 100,
      currency: 'KES',
      paymentMethod: 'MOBILE_MONEY',
      phone: '+254700000000',
      email: 'user@example.com',
    });

    expect(paystack.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100 }),
    );
    expect(prisma.deposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 100, fee: 0, total: 100 }),
      }),
    );
    expect(result.deposit.fee).toBe(0);
    expect(result.deposit.total).toBe(100);
  });

  it('emits wallet and transaction updates after a successful deposit is committed', async () => {
    const deposit = {
      id: 'deposit-3',
      userId: 'user-1',
      amount: 25,
      currency: 'FARM',
      status: 'PENDING',
    };
    const transaction = {
      id: 'transaction-3',
      transaction_reference: 'reference-3',
      transaction_type: 'deposit',
      status: 'pending',
      receiver_wallet_id: 'wallet-1',
      amount: 25,
    };
    const wallet = { id: 'wallet-1', user_id: 'user-1', balance: 100 };
    const tx = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue(wallet),
        update: jest.fn().mockResolvedValue({ ...wallet, balance: 125 }),
      },
      deposit: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactions: {
        update: jest.fn().mockResolvedValue({ ...transaction, status: 'completed' }),
      },
      ledger_entries: {
        create: jest.fn().mockResolvedValue({ id: 'ledger-3' }),
      },
    };

    prisma.deposit.findFirst = jest.fn().mockResolvedValue(deposit);
    prisma.transactions.findUnique = jest.fn().mockResolvedValue(transaction);
    prisma.$transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    cache.cacheInvalidatePattern = jest.fn().mockResolvedValue(undefined);
    cache.cacheDelete = jest.fn().mockResolvedValue(undefined);
    websocket.emitBalanceUpdate = jest.fn();
    websocket.emitTransactionUpdate = jest.fn();

    await expect(
      service.finalizeSuccessfulDeposit('reference-3'),
    ).resolves.toBe(true);

    expect(websocket.emitBalanceUpdate).toHaveBeenCalledWith('user-1', 125);
    expect(websocket.emitTransactionUpdate).toHaveBeenCalledWith('user-1', {
      reference: 'reference-3',
      status: 'SUCCESS',
    });
  });

  it('stores the verified Paystack channel instead of the selected checkout default', async () => {
    const deposit = {
      id: 'deposit-4',
      userId: 'user-1',
      amount: 25,
      currency: 'KES',
      paymentMethod: 'CARD',
      status: 'SUCCESS',
    };
    const transaction = {
      id: 'transaction-4',
      transaction_reference: 'reference-4',
      transaction_type: 'deposit',
      status: 'completed',
      amount: 25,
      metadata: { provider: 'paystack', payment_method: 'CARD' },
    };
    const tx = {
      transactions: { update: jest.fn().mockResolvedValue(transaction) },
      deposit: { update: jest.fn().mockResolvedValue(deposit) },
    };
    prisma.deposit.findFirst = jest.fn().mockResolvedValue(deposit);
    prisma.transactions.findUnique = jest.fn().mockResolvedValue(transaction);
    prisma.$transaction = jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    paystack.verifyTransaction = jest.fn().mockResolvedValue({
      status: 'success',
      channel: 'mobile_money',
    });

    await expect(
      service.finalizeSuccessfulDeposit('reference-4'),
    ).resolves.toBe(true);

    expect(tx.transactions.update).toHaveBeenCalledWith({
      where: { id: 'transaction-4' },
      data: {
        metadata: {
          provider: 'paystack',
          payment_method: 'MOBILE_MONEY',
          payment_channel: 'mobile_money',
        },
      },
    });
    expect(tx.deposit.update).toHaveBeenCalledWith({
      where: { id: 'deposit-4' },
      data: { paymentMethod: 'MOBILE_MONEY' },
    });
  });

  it.each([
    [{ channel: 'mobile_money', mobile_money: { provider: 'mpesa' } }, 'MPESA'],
    [{ channel: 'mobile_money', authorization: { brand: 'Airtel' } }, 'AIRTEL'],
    [{ channel: 'mobile_money' }, null],
  ])('recognizes a Paystack mobile-money provider when supplied', (verified, expected) => {
    expect((service as any).paystackMobileMoneyProvider(verified)).toBe(expected);
  });
});
