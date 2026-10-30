import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { CacheService } from '../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrencyConversionService } from '../currency/currency-conversion.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { PaystackTransferInitiationError } from '../paystack/paystack.service';
import { NowpaymentsService } from '../nowpayments/nowpayments.service';

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
        findFirst: jest.fn(),
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
        {
          provide: AuthService,
          useValue: { verifyPin: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: SecurityService,
          useValue: {
            verifyDevice: jest.fn().mockResolvedValue({ trusted: true }),
          },
        },
        { provide: PaystackService, useValue: {} },
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
        {
          provide: NotificationsService,
          useValue: { sendNotification: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: CurrencyConversionService,
          useValue: {
            getCurrentRate: jest.fn().mockResolvedValue({
              usd_kes_rate: 150,
              farm_kes_rate: 1,
              farm_usd_rate: 0.00666667,
            }),
          },
        },
        {
          provide: WebsocketGateway,
          useValue: {
            emitBalanceUpdate: jest.fn(),
            emitTransactionUpdate: jest.fn(),
          },
        },
        {
          provide: NowpaymentsService,
          useValue: {
            getAvailableCurrencies: jest.fn().mockResolvedValue(['btc']),
            estimateAmount: jest.fn(),
            getPayoutMinimum: jest.fn(),
            estimatePayoutFee: jest.fn(),
          },
        },
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
          not: 'FAILED',
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('reports the USD 2 crypto withdrawal minimum', async () => {
    const result = await service.getNowpaymentsCryptoMinimum();

    expect(result.data.minimumUsd).toBe(2);
    expect(result.data.minimumFarm).toBeGreaterThan(0);
    expect(result.data.farmUsdRate).toBe(0.00666667);
  });

  it('rejects NOWPayments crypto withdrawals below USD 2 before reserving funds', async () => {
    jest
      .spyOn(service as any, 'processWithdrawal')
      .mockResolvedValue(undefined);
    (service as any).currencyConversionService.getCurrentRate.mockResolvedValue({
      farm_usd_rate: 1,
    });
    prisma.wallets.findFirst.mockResolvedValue({
      id: 'wallet-1',
      balance: 100,
      locked_balance: 0,
    });

    await expect(
      service.createNowpaymentsCryptoWithdrawal('user-1', {
        amount: 1.99,
        method: 'CRYPTO',
        cryptoAddress: 'bc1qexample',
        cryptoAsset: 'BTC',
        pin: '1234',
      } as any),
    ).rejects.toThrow(
      'Minimum crypto withdrawal is USD 2.00 before the 1.5% withdrawal fee',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'BANK_TRANSFER',
      4999,
      {
        accountName: 'Jane Doe',
        accountNumber: '12345678',
        bankName: 'Example Bank',
      },
    ],
    [
      'MOBILE_MONEY',
      1499,
      {
        accountName: 'Jane Doe',
        phoneNumber: '+254700000000',
        mobileMoneyProvider: 'MPESA',
      },
    ],
  ])(
    'accepts the %s minimum withdrawal of FARM %i',
    async (method, minimum, fields) => {
      jest
        .spyOn(service as any, 'processWithdrawal')
        .mockResolvedValue(undefined);
      prisma.wallets.findFirst.mockResolvedValue({
        id: 'wallet-1',
        balance: 10000,
        locked_balance: 0,
      });
      prisma.$transaction.mockImplementation(async (callback: any) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(1),
          wallets: {
            update: jest.fn().mockResolvedValue({
              balance: 10000,
              locked_balance: minimum,
            }),
          },
          withdrawal: {
            aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: 0 } }),
            create: jest.fn().mockResolvedValue({
              id: 'withdrawal-1',
              reference: 'ref-1',
            }),
          },
          transactions: { create: jest.fn().mockResolvedValue({}) },
        }),
      );

      await expect(
        service.createWithdrawal('user-1', {
          amount: minimum,
          method,
          pin: '1234',
          ...fields,
        } as any),
      ).resolves.toMatchObject({ success: true });
    },
  );

  it.each([
    [
      'BANK_TRANSFER',
      4998,
      'Minimum withdrawal amount for bank transfer is 4,999 FARM',
      {
        accountName: 'Jane Doe',
        accountNumber: '12345678',
        bankName: 'Example Bank',
      },
    ],
    [
      'MOBILE_MONEY',
      1498,
      'Minimum withdrawal amount for mobile money is 1,499 FARM',
      {
        accountName: 'Jane Doe',
        phoneNumber: '+254700000000',
        mobileMoneyProvider: 'MPESA',
      },
    ],
  ])(
    'rejects a %s withdrawal below the minimum',
    async (method, amount, message, fields) => {
      await expect(
        service.createWithdrawal('user-1', {
          amount,
          method,
          pin: '1234',
          ...fields,
        } as any),
      ).rejects.toThrow(message);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('creates a Kenyan Paystack bank recipient and transfers the KES settlement', async () => {
    const withdrawal = {
      userId: 'user-1',
      amount: 100,
      settlement: 98.5,
      method: 'BANK_TRANSFER',
      accountNumber: '12345678',
      bankName: 'Example Bank',
      user: { first_name: 'Jane', last_name: 'Doe' },
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
    paystack.initiateTransfer = jest.fn().mockResolvedValue({
      data: { transfer_code: 'TRF_1', status: 'pending' },
    });

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
    paystack.initiateTransfer = jest.fn().mockResolvedValue({
      data: { transfer_code: 'TRF_MPESA', status: 'pending' },
    });

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

  it('retains reserved funds when Paystack transfer acceptance is uncertain', async () => {
    const withdrawal = {
      id: 'withdrawal-1',
      userId: 'user-1',
      amount: 100,
      settlement: 98.5,
      method: 'BANK_TRANSFER',
      accountName: 'Jane Doe',
      accountNumber: '12345678',
      bankName: 'Example Bank',
    };
    const transaction = {
      id: 'tx-1',
      metadata: {
        paystack_conversion_snapshot: {
          farmKesRate: 1,
          settlementKes: 98.5,
        },
      },
    };
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 1 });
    prisma.withdrawal.findUnique.mockResolvedValue(withdrawal);
    prisma.transactions.findUnique.mockResolvedValue(transaction);

    const paystack = (service as any).paystack;
    paystack.getBankCodeByName = jest.fn().mockResolvedValue('BANK_CODE');
    paystack.createTransferRecipient = jest
      .fn()
      .mockResolvedValue({ recipient_code: 'RCP_1' });
    paystack.initiateTransfer = jest
      .fn()
      .mockRejectedValue(
        new PaystackTransferInitiationError(
          'Paystack transfer outcome is unknown: timeout',
          'unknown',
        ),
      );
    const rejectWithdrawal = jest
      .spyOn(service, 'rejectWithdrawal')
      .mockResolvedValue(true);

    await (service as any).processWithdrawal('withdrawal-ref');

    expect(rejectWithdrawal).not.toHaveBeenCalled();
    expect(prisma.transactions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: {
          metadata: expect.objectContaining({
            paystack_transfer_status: 'unknown',
            paystack_transfer_outcome_unknown_reason:
              'Paystack transfer outcome is unknown: timeout',
          }),
        },
      }),
    );
  });

  it('finalizes a pending withdrawal when Paystack status polling confirms success', async () => {
    prisma.withdrawal.findFirst
      .mockResolvedValueOnce({
        reference: 'withdrawal-ref',
        userId: 'user-1',
        status: 'PROCESSING',
        method: 'BANK_TRANSFER',
        amount: 100,
        currency: 'FARM',
      })
      .mockResolvedValueOnce({
        reference: 'withdrawal-ref',
        userId: 'user-1',
        status: 'COMPLETED',
        method: 'BANK_TRANSFER',
        amount: 100,
        currency: 'FARM',
      });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      metadata: { paystack_transfer_code: 'TRF_1' },
    });
    (service as any).paystack.getTransferByReference = jest
      .fn()
      .mockResolvedValue({
        reference: 'withdrawal-ref',
        status: 'success',
      });
    const markAsSuccess = jest
      .spyOn(service, 'markAsSuccess')
      .mockResolvedValue(true);

    const status = await service.getWithdrawalStatus(
      'withdrawal-ref',
      'user-1',
    );

    expect(markAsSuccess).toHaveBeenCalledWith('withdrawal-ref');
    expect(status).toMatchObject({
      withdrawal_status: 'COMPLETED',
      paystack_transfer_status: 'success',
    });
    expect(
      (service as any).paystack.getTransferByReference,
    ).toHaveBeenCalledWith('withdrawal-ref');
  });

  it('verifies pending Paystack withdrawals by reference without a transfer code', async () => {
    prisma.withdrawal.findFirst
      .mockResolvedValueOnce({
        reference: 'withdrawal-ref',
        userId: 'user-1',
        status: 'PROCESSING',
        method: 'MOBILE_MONEY',
      })
      .mockResolvedValueOnce({
        reference: 'withdrawal-ref',
        userId: 'user-1',
        status: 'PROCESSING',
        method: 'MOBILE_MONEY',
      });
    prisma.transactions.findUnique
      .mockResolvedValueOnce({ id: 'tx-1', metadata: {} })
      .mockResolvedValueOnce({ id: 'tx-1', metadata: {} });
    (service as any).paystack.getTransferByReference = jest
      .fn()
      .mockResolvedValue({
        reference: 'withdrawal-ref',
        status: 'pending',
      });

    const status = await service.getWithdrawalStatus(
      'withdrawal-ref',
      'user-1',
    );

    expect(
      (service as any).paystack.getTransferByReference,
    ).toHaveBeenCalledWith('withdrawal-ref');
    expect(status).toMatchObject({
      withdrawal_status: 'PROCESSING',
      paystack_transfer_status: 'pending',
    });
    expect(prisma.transactions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: {
          metadata: expect.objectContaining({
            provider: 'paystack',
            paystack_transfer_status: 'pending',
            paystack_transfer_requires_otp: false,
          }),
        },
      }),
    );
  });

  it('reconciles aged pending Paystack withdrawals using provider status', async () => {
    prisma.withdrawal.findMany.mockResolvedValue([
      { reference: 'withdrawal-ref', userId: 'user-1' },
    ]);
    const getWithdrawalStatus = jest
      .spyOn(service, 'getWithdrawalStatus')
      .mockResolvedValue({} as any);

    await service.reconcilePendingPaystackWithdrawals();

    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PROCESSING',
          method: { in: ['MOBILE_MONEY', 'BANK_TRANSFER'] },
        }),
        take: 50,
      }),
    );
    expect(getWithdrawalStatus).toHaveBeenCalledWith(
      'withdrawal-ref',
      'user-1',
    );
  });

  it('marks a completed withdrawal as success and updates user wallet', async () => {
    const userWallet = {
      id: 'wallet-user',
      balance: 1000,
      locked_balance: 1000,
    };
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
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      metadata: {},
    });
    prisma.wallets.findFirst.mockResolvedValue(userWallet);
    prisma.users.findFirst.mockResolvedValue({ wallets: [adminWallet] });

    const txWalletUpdates: any[] = [];
    const txLedgerCreates: any[] = [];
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        $executeRaw: jest.fn().mockImplementation(async () => {
          txWalletUpdates.push({ where: { id: 'wallet-user' } });
          return 1;
        }),
        withdrawal: {
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        users: {
          findFirst: jest.fn().mockResolvedValue({ wallets: [adminWallet] }),
        },
        wallets: {
          update: jest
            .fn()
            .mockImplementation(
              async ({ where, data }: { where: any; data: any }) => {
                txWalletUpdates.push({ where, data });
                return { id: where.id };
              },
            ),
        },
        transactions: { update: jest.fn().mockResolvedValue({}) },
        ledger_entries: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockImplementation(async ({ data }: { data: any }) => {
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
            {
              id: 'tx-withdrawal',
              transaction_reference: 'ref-2',
              fee: 4.35,
            },
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
          create: jest
            .fn()
            .mockImplementation(async ({ data }: { data: any }) => {
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
