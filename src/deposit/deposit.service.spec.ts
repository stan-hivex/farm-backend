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

  it('deducts the public merchant QR fee before crediting wallets', async () => {
    const transaction = {
      id: 'transaction-qr-1',
      transaction_reference: 'qr-reference-1',
      transaction_type: 'deposit',
      status: 'pending',
      amount: 100,
      currency: 'FARM',
      metadata: {
        provider: 'ivorypay',
        user_id: 'merchant-user-1',
        merchant_id: 'merchant-1',
        qr_guest_payment: true,
      },
    };
    const deposit = {
      id: 'deposit-qr-1',
      userId: 'merchant-user-1',
      amount: 100,
      currency: 'FARM',
      status: 'PENDING',
    };
    const merchantWallet = {
      id: 'merchant-wallet-1',
      balance: 10,
    };
    const superadminWallet = {
      id: 'superadmin-wallet-1',
      balance: 0,
    };
    const tx: any = {
      merchants: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'merchant-1',
          user_id: 'merchant-user-1',
          business_name: 'Test Merchant',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      wallets: {
        findFirst: jest.fn().mockResolvedValue(merchantWallet),
        update: jest
          .fn()
          .mockResolvedValueOnce({ balance: 109 })
          .mockResolvedValueOnce({ balance: 1 }),
      },
      users: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'superadmin-1',
          wallets: [superadminWallet],
        }),
      },
      deposit: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactions: {
        update: jest.fn().mockResolvedValue({}),
      },
      qr_payments: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ledger_entries: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    prisma.deposit.findFirst = jest.fn().mockResolvedValue(deposit);
    prisma.transactions.findUnique = jest.fn().mockResolvedValue(transaction);
    prisma.$transaction = jest.fn((callback) => callback(tx));
    cache.cacheInvalidatePattern = jest.fn().mockResolvedValue(undefined);
    cache.cacheDelete = jest.fn().mockResolvedValue(undefined);
    websocket.emitBalanceUpdate = jest.fn();
    notifications.sendNotification = jest.fn().mockResolvedValue(undefined);

    await expect(service.finalizeSuccessfulDeposit(transaction.transaction_reference))
      .resolves.toBe(true);

    expect(tx.wallets.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'merchant-wallet-1' },
      data: { balance: { increment: 99 } },
    });
    expect(tx.wallets.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'superadmin-wallet-1' },
      data: { balance: { increment: 1 } },
    });
    expect(tx.transactions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: transaction.id },
        data: expect.objectContaining({
          transaction_type: 'merchant_payment',
          status: 'completed',
          fee: 1,
          net_amount: 99,
          receiver_wallet_id: 'merchant-wallet-1',
          metadata: expect.objectContaining({
            platform_fee_type: 'merchant_sale',
            platform_fee_percent: 1,
            platform_fee: 1,
          }),
        }),
      }),
    );
    expect(tx.ledger_entries.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          wallet_id: 'merchant-wallet-1',
          entry_type: 'credit',
          amount: 99,
        }),
        expect.objectContaining({
          wallet_id: 'superadmin-wallet-1',
          entry_type: 'credit',
          amount: 1,
        }),
      ]),
    });
  });
});
