import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { CacheService } from '../common/cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('WithdrawService', () => {
  let service: WithdrawService;
  let prisma: any;
  let module: TestingModule;

  beforeEach(async () => {
    const prismaMock = {
      wallets: { findFirst: jest.fn() },
      withdrawal: { create: jest.fn(), findUnique: jest.fn() },
      transactions: { create: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: { verifyPin: jest.fn().mockResolvedValue(true) } },
        { provide: SecurityService, useValue: { verifyDevice: jest.fn().mockResolvedValue({ trusted: true }) } },
        { provide: PaystackService, useValue: {} },
        { provide: IvorypayService, useValue: { createWithdrawal: jest.fn() } },
        { provide: CacheService, useValue: { cacheInvalidatePattern: jest.fn().mockResolvedValue(true), cacheDelete: jest.fn().mockResolvedValue(true), cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn().mockResolvedValue(true) } },
        { provide: NotificationsService, useValue: { sendNotification: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<WithdrawService>(WithdrawService);
    prisma = module.get(PrismaService);
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
      amount: 20,
      method: 'CRYPTO',
      cryptoAddress: '0xabc',
      network: 'Polygon',
      cryptoAsset: 'USDC',
      pin: '1234',
    } as any);

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
      cryptoAddress: '0xabc',
      network: 'POLYGON',
    };
    const ivorypay = module.get<IvorypayService>(IvorypayService);
    const createWithdrawalSpy = jest.spyOn(ivorypay as any, 'createWithdrawal').mockResolvedValue({ data: { id: 'WD_1' }, providerTransactionId: 'WD_1' });

    await (service as any).processCryptoWithdrawal(withdrawal, 'ref-1');

    expect(createWithdrawalSpy).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'ref-1',
      amount: 90,
      crypto: 'USDC',
      to_address: '0xabc',
      network: 'POLYGON',
    }));
  });

  it('marks a completed withdrawal as success and updates user wallet', async () => {
    const userWallet = { id: 'wallet-user', balance: 1000, locked_balance: 1000 };
    const adminWallet = { id: 'wallet-admin', balance: 500, locked_balance: 0 };

    prisma.withdrawal.findUnique.mockResolvedValue({
      id: 'withdrawal-1',
      reference: 'ref-1',
      userId: 'user-1',
      amount: 1000,
      status: 'PENDING',
      method: 'BANK_TRANSFER',
    });
    prisma.transactions.findUnique.mockResolvedValue({ id: 'tx-1', metadata: {} });
    prisma.wallets.findFirst.mockResolvedValue(userWallet);

    const txWalletUpdates: any[] = [];
    const txLedgerCreates: any[] = [];
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        withdrawal: { update: jest.fn().mockResolvedValue({}) },
        wallets: {
          update: jest.fn().mockImplementation(async ({ where, data }: { where: any; data: any }) => {
            txWalletUpdates.push({ where, data });
            return { id: where.id };
          }),
        },
        transactions: { update: jest.fn().mockResolvedValue({}) },
        ledger_entries: { create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
          txLedgerCreates.push(data);
          return {};
        }) },
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
      ]),
    );
  });
});
