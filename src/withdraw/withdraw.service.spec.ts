import { Test, TestingModule } from '@nestjs/testing';
import { WithdrawService } from './withdraw.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';

describe('WithdrawService', () => {
  let service: WithdrawService;
  let prisma: any;

  beforeEach(async () => {
    const prismaMock = {
      wallets: { findFirst: jest.fn() },
      withdrawal: { create: jest.fn(), findUnique: jest.fn() },
      transactions: { create: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: { verifyPin: jest.fn().mockResolvedValue(true) } },
        { provide: PaystackService, useValue: {} },
        { provide: IvorypayService, useValue: {} },
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
      network: 'Polygon',
      cryptoAsset: 'USDC',
    });
  });
});
