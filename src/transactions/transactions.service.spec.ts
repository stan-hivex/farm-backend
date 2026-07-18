import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-current', user_id: 'user-1' }),
      },
      transactions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-1',
            sender_wallet_id: 'wallet-sender',
            receiver_wallet_id: 'wallet-recipient',
            transaction_type: 'transfer',
            status: 'completed',
            amount: 100,
            fee: 0,
            net_amount: 100,
            description: 'Transfer',
            created_at: new Date(),
            wallets_transactions_sender_wallet_idTowallets: {
              users: {
                id: 'user-2',
                username: 'sender-user',
                first_name: 'Sender',
                last_name: 'User',
                profile_image: null,
              },
            },
            wallets_transactions_receiver_wallet_idTowallets: {
              users: {
                id: 'user-3',
                username: 'recipient-user',
                first_name: 'Recipient',
                last_name: 'User',
                profile_image: null,
              },
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: { cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('adds sender and recipient identities to transaction responses', async () => {
    const result = await service.findAll('user-1', { page: 1, limit: 10 });

    expect(result.data[0].sender_username).toBe('sender-user');
    expect(result.data[0].recipient_username).toBe('recipient-user');
    expect(result.data[0].sender_user.username).toBe('sender-user');
    expect(result.data[0].recipient_user.username).toBe('recipient-user');
    expect(result.data[0].users_sender.username).toBe('sender-user');
    expect(result.data[0].users_recipient.username).toBe('recipient-user');
  });
});
