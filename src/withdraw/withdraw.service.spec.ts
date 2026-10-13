import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { CacheService } from '../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

describe('WithdrawService', () => {
  let service: WithdrawService;
  let prisma: any;
  let module: TestingModule;

  beforeEach(async () => {
    const prismaMock = {
      wallets: { findFirst: jest.fn() },
      users: { findFirst: jest.fn() },
      withdrawal: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      transactions: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: { verifyPin: jest.fn().mockResolvedValue(true) } },
        { provide: SecurityService, useValue: { verifyDevice: jest.fn().mockResolvedValue({ trusted: true }) } },
        { provide: PaystackService, useValue: {} },
        { provide: IvorypayService, useValue: { createWithdrawal: jest.fn(), verifyTransaction: jest.fn() } },
        {
          provide: CacheService,
          useValue: {
            cacheInvalidatePattern: jest.fn().mockResolvedValue(true),
            cacheDelete: jest.fn().mockResolvedValue(true),
            cacheGet: jest.fn().mockResolvedValue(null),
            cacheSet: jest.fn().mockResolvedValue(true),
            invalidateWallet: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: NotificationsService, useValue: { sendNotification: jest.fn().mockResolvedValue(true) } },
        { provide: CurrencyConversionService, useValue: { getCurrentRate: jest.fn().mockResolvedValue({ usd_kes_rate: 150, farm_kes_rate: 1, farm_usd_rate: 0.00666667 }) } },
        { provide: WebsocketGateway, useValue: { emitBalanceUpdate: jest.fn(), emitTransactionUpdate: jest.fn() } },
      ],
    }).compile();

    service = module.get<WithdrawService>(WithdrawService);
    prisma = module.get(PrismaService);
  });

  it('hides pending and failed withdrawals from user history', async () => {
    await service.getUserWithdrawals('user-1');

    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: {
          notIn: ['PENDING', 'PROCESSING', 'FAILED', 'CANCELLED'],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('persists the selected crypto asset for crypto withdrawals', async () => {
    jest.spyOn(service as any, 'processWithdrawal').mockResolvedValue(undefined);

    prisma.wallets.findFirst.mockResolvedValue({
      id: 'wallet-1',
      balance: 1000,
      locked_balance: 0,
    });

    let createdWithdrawalData: any;
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        wallets: { update: jest.fn().mockResolvedValue({}) },
        withdrawal: {
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            createdWithdrawalData = data;
            return { id: 'withdrawal-1', reference: 'ref-1' };
          }),
        },
        transactions: { create: jest.fn().mockResolvedValue({}) },
      };

      return callback(tx);
    });

    await service.createWithdrawal('user-1', {
      amount: 200,
      method: 'CRYPTO',
      cryptoAddress: '0xabc',
      network: 'Polygon',
      cryptoAsset: 'USDC',
      pin: '1234',
    } as any);

    expect(module.get(WebsocketGateway).emitBalanceUpdate).toHaveBeenCalledWith(
      'user-1',
      800,
    );
    expect(createdWithdrawalData).toMatchObject({
      cryptoAddress: '0xabc',
      network: 'POLYGON',
      cryptoAsset: 'USDC',
    });
  });

  it('accepts walletaddress alias for crypto withdrawals', async () => {
    jest.spyOn(service as any, 'processWithdrawal').mockResolvedValue(undefined);

    prisma.wallets.findFirst.mockResolvedValue({
      id: 'wallet-1',
      balance: 1000,
      locked_balance: 0,
    });

    let createdWithdrawalData: any;
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        wallets: { update: jest.fn().mockResolvedValue({}) },
        withdrawal: {
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            createdWithdrawalData = data;
            return { id: 'withdrawal-1', reference: 'ref-1' };
          } ),
        },
        transactions: { create: jest.fn().mockResolvedValue({}) },
      };

      return callback(tx);
    });

    await service.createWithdrawal('user-1', {
      amount: 200,
      method: 'CRYPTO',
      walletaddress: '0xabc',
      network: 'Polygon',
      token: 'USDC',
      pin: '1234',
    } as any);

    expect(createdWithdrawalData).toMatchObject({
      cryptoAddress: '0xabc',
      network: 'POLYGON',
      cryptoAsset: 'USDC',
    });
  });

  it('passes network to Ivorypay for crypto withdrawals', async () => {
    const withdrawal = {
      userId: 'user-1',
      settlement: 90,
      cryptoAsset: 'USDC',
      cryptoAddress: '0xabc1234567890abcdef1234567890abcdef1234',
      network: 'POLYGON',
    };
    const createWithdrawalSpy = jest.spyOn((service as any).ivorypay as any, 'createWithdrawal').mockResolvedValue({ data: { id: 'WD_1' }, providerTransactionId: 'WD_1' });

    await (service as any).processCryptoWithdrawal(withdrawal, 'ref-1');

    expect(createWithdrawalSpy).toHaveBeenCalled();
    const callArg: any = createWithdrawalSpy.mock.calls[0][0];
    expect(callArg).toMatchObject({
      reference: 'ref-1',
      crypto: 'USDC',
      to_address: '0xabc1234567890abcdef1234567890abcdef1234',
      network: 'POLYGON',
    });
    // crypto amount is derived from the authoritative farm->USD rate (mock returns farm_usd_rate=0.00666667)
    expect(callArg.amount).toBeCloseTo(0.6000003, 6);
  });

  it('creates a Kenyan Paystack bank recipient and transfers the KES settlement', async () => {
    const withdrawal = {
      userId: 'user-1',
      amount: 100,
      settlement: 98.5,
      method: 'BANK_TRANSFER',
      accountName: 'Jane Doe',
      accountNumber: '12345678',
      bankName: 'Example Bank',
    };
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    prisma.withdrawal.findUnique.mockResolvedValue(withdrawal);
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      metadata: {
        paystack_conversion_snapshot: {
          farmKesRate: 1.25,
          settlementKes: 123.13,
        },
      },
    });

    const paystack = (service as any).paystack;
    paystack.getBankCodeByName = jest.fn().mockResolvedValue('BANK_CODE');
    paystack.createTransferRecipient = jest
      .fn()
      .mockResolvedValue({ recipient_code: 'RCP_1' });
    paystack.initiateTransfer = jest
      .fn()
      .mockResolvedValue({ data: { transfer_code: 'TRF_1', status: 'pending' } });

    await (service as any).processWithdrawal('withdrawal-ref');

    expect(paystack.createTransferRecipient).toHaveBeenCalledWith({
      type: 'kepss',
      name: 'Jane Doe',
      account_number: '12345678',
      bank_code: 'BANK_CODE',
      currency: 'KES',
    });
    expect(paystack.initiateTransfer).toHaveBeenCalledWith({
      source: 'balance',
      amount: 123.13,
      recipient: 'RCP_1',
      reference: 'withdrawal-ref',
      currency: 'KES',
      reason: 'FARM withdrawal withdrawal-ref',
    });
  });

  it('creates a Paystack mobile money recipient with the selected M-Pesa code', async () => {
    const withdrawal = {
      userId: 'user-1',
      amount: 1500,
      settlement: 1477.5,
      method: 'MOBILE_MONEY',
      accountName: 'Jane Doe',
      phoneNumber: '+254700000000',
      bankName: 'MPESA',
    };
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    prisma.withdrawal.findUnique.mockResolvedValue(withdrawal);
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      metadata: {
        paystack_conversion_snapshot: {
          farmKesRate: 1,
          settlementKes: 1477.5,
        },
      },
    });

    const paystack = (service as any).paystack;
    paystack.createTransferRecipient = jest
      .fn()
      .mockResolvedValue({ recipient_code: 'RCP_MPESA' });
    paystack.initiateTransfer = jest
      .fn()
      .mockResolvedValue({ data: { transfer_code: 'TRF_MPESA', status: 'pending' } });

    await (service as any).processWithdrawal('mobile-ref');

    expect(paystack.createTransferRecipient).toHaveBeenCalledWith({
      type: 'mobile_money',
      name: 'Jane Doe',
      account_number: '0700000000',
      bank_code: 'MPESA',
      currency: 'KES',
    });
    expect(paystack.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'balance',
        amount: 1477.5,
        recipient: 'RCP_MPESA',
        currency: 'KES',
      }),
    );
  });

  it('marks a completed withdrawal as success and updates user wallet', async () => {
    const userWallet = { id: 'wallet-user', balance: 1000, locked_balance: 1000 };
    const adminWallet = { id: 'wallet-admin', balance: 500, locked_balance: 0 };

    prisma.withdrawal.findUnique.mockResolvedValue({
      id: 'withdrawal-1',
      reference: 'ref-1',
      userId: 'user-1',
      amount: 1000,
      fee: 15,
      status: 'PENDING',
      method: 'BANK_TRANSFER',
    });
    prisma.transactions.findUnique.mockResolvedValue({ id: 'tx-1', metadata: {} });
    prisma.wallets.findFirst.mockResolvedValue(userWallet);
    prisma.users.findFirst.mockResolvedValue({ wallets: [adminWallet] });

    const txWalletUpdates: any[] = [];
    const txLedgerCreates: any[] = [];
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        withdrawal: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        users: { findFirst: jest.fn().mockResolvedValue({ wallets: [adminWallet] }) },
        wallets: {
          update: jest.fn().mockImplementation(async ({ where, data }: { where: any; data: any }) => {
            txWalletUpdates.push({ where, data });
            return { id: where.id };
          }),
        },
        transactions: { update: jest.fn().mockResolvedValue({}) },
        ledger_entries: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            txLedgerCreates.push(data);
            return {};
          }),
        },
      };

      return callback(tx);
    });

    await service.markAsSuccess('ref-1');

    expect(txWalletUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: { id: 'wallet-user' } }),
      ]),
    );
    expect(txLedgerCreates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entry_type: 'debit', amount: 1000 }),
        expect.objectContaining({
          transaction_id: 'tx-1',
          entry_type: 'credit',
          amount: 15,
          description: 'Platform withdrawal fee credited — ref: ref-1',
        }),
      ]),
    );
  });

  it('credits completed withdrawal fees that are missing from the superadmin ledger', async () => {
    const adminWallet = { id: 'wallet-admin', balance: 500, locked_balance: 0 };
    const walletUpdates: any[] = [];
    const ledgerCreates: any[] = [];
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        users: {
          findFirst: jest.fn().mockResolvedValue({ wallets: [adminWallet] }),
        },
        transactions: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'tx-withdrawal', transaction_reference: 'ref-2', fee: 4.35 },
          ]),
        },
        wallets: {
          findUnique: jest.fn().mockResolvedValue(adminWallet),
          update: jest.fn().mockImplementation(async (args: any) => {
            walletUpdates.push(args);
            return adminWallet;
          }),
        },
        ledger_entries: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            ledgerCreates.push(data);
            return {};
          }),
        },
      };

      return callback(tx);
    });

    await service.reconcileCompletedPlatformFees();

    expect(walletUpdates).toEqual([
      {
        where: { id: 'wallet-admin' },
        data: { balance: { increment: 4.35 } },
      },
    ]);
    expect(ledgerCreates).toEqual([
      expect.objectContaining({
        transaction_id: 'tx-withdrawal',
        wallet_id: 'wallet-admin',
        entry_type: 'credit',
        amount: 4.35,
        description: 'Platform withdrawal fee credited — ref: ref-2',
      }),
    ]);
  });
});
