import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const prisma = {
      wallets: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'wallet-current', user_id: 'user-1' }),
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
        {
          provide: CacheService,
          useValue: {
            cacheGet: jest.fn().mockResolvedValue(null),
            cacheSet: jest.fn().mockResolvedValue(undefined),
          },
        },
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

  it('excludes unsuccessful transactions from user history queries', async () => {
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-current' }),
      },
      transactions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const cache = {
      cacheGet: jest.fn().mockResolvedValue(null),
      cacheSet: jest.fn().mockResolvedValue(undefined),
    };
    const filteredService = new TransactionsService(
      prisma as any,
      cache as any,
    );

    await filteredService.findAll('user-1', { page: 1, limit: 10 });

    expect(prisma.transactions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              status: expect.objectContaining({
                notIn: expect.arrayContaining([
                  'pending',
                  'processing',
                  'failed',
                  'cancelled',
                  'reversed',
                ]),
              }),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.transactions.count).toHaveBeenCalledWith({
      where: prisma.transactions.findMany.mock.calls[0][0].where,
    });
  });

  it('returns persisted deposit and provider details for a transaction receipt', async () => {
    const transaction = {
      id: 'tx-deposit',
      transaction_reference: 'deposit-reference',
      sender_wallet_id: null,
      receiver_wallet_id: 'wallet-current',
      transaction_type: 'deposit',
      status: 'completed',
      amount: 30,
      fee: 0,
      net_amount: 30,
      currency: 'FARM',
      description: 'Successful deposit',
      created_at: new Date('2026-10-01T12:00:00.000Z'),
      metadata: {
        provider: 'ivorypay',
        payment_method: 'CRYPTO',
        amount_farm: 30,
        amount_usd: 0.23,
        currency_fiat: 'USD',
      },
      ledger_entries: [],
      wallets_transactions_sender_wallet_idTowallets: null,
      wallets_transactions_receiver_wallet_idTowallets: null,
    };
    const transactionFindFirst = jest.fn().mockResolvedValue(transaction);
    const prisma = {
      wallets: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'wallet-current', user_id: 'user-1' }),
      },
      users: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'deposit-owner',
          first_name: 'Deposit',
          last_name: 'Owner',
          profile_image: null,
        }),
      },
      transactions: {
        findFirst: transactionFindFirst,
      },
      deposit: {
        findFirst: jest.fn().mockResolvedValue({
          currency: 'FARM',
          paymentMethod: 'CRYPTO',
          provider: 'ivorypay',
          providerRef: 'ivorypay-reference',
          providerTransactionId: 'ivorypay-transaction-id',
          paymentReference: 'payment-reference',
          merchantReference: 'merchant-reference',
          checkoutId: 'checkout-id',
          blockchainTransactionHash: '0xblockchain-hash',
          status: 'SUCCESS',
          verifiedAt: new Date('2026-10-01T12:01:00.000Z'),
          creditedAt: new Date('2026-10-01T12:01:01.000Z'),
          webhookReceived: new Date('2026-10-01T12:00:30.000Z'),
          verificationAttempts: 1,
        }),
      },
      withdrawal: {
        findUnique: jest.fn(),
      },
      merchants: {
        findUnique: jest.fn(),
      },
    };
    const detailedService = new TransactionsService(
      prisma as any,
      {
        cacheGet: jest.fn(),
        cacheSet: jest.fn(),
      } as any,
    );

    const result = await detailedService.findOne('user-1', 'tx-deposit');

    expect(transactionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ transaction_reference: 'tx-deposit' }],
          AND: [
            {
              OR: [
                { sender_wallet_id: 'wallet-current' },
                { receiver_wallet_id: 'wallet-current' },
              ],
            },
          ],
        },
      }),
    );
    expect(result.data).toMatchObject({
      amount: 30,
      fee: 0,
      net_amount: 30,
      amount_farm: 30,
      fiat_amount: 0.23,
      fiat_currency: 'USD',
      payment_method: 'CRYPTO',
      payment_provider: 'ivorypay',
      sender_name: 'IvoryPay',
      receiver_name: 'Deposit Owner',
      sender_username: '',
      recipient_username: 'deposit-owner',
      provider_reference: 'ivorypay-reference',
      provider_transaction_id: 'ivorypay-transaction-id',
      payment_reference: 'payment-reference',
      merchant_reference: 'merchant-reference',
      checkout_id: 'checkout-id',
      blockchain_tx_hash: '0xblockchain-hash',
      deposit_status: 'SUCCESS',
      deposit_verification_attempts: 1,
    });
  });

  it('looks up UUID identifiers by either transaction id or reference', async () => {
    const transactionId = '086c42f6-8fd1-42c7-8dc8-fb08e45839eb';
    const transaction = {
      id: '3f4a0b92-fcf8-46ac-a42d-9ec71f4ac182',
      transaction_reference: transactionId,
      sender_wallet_id: null,
      receiver_wallet_id: 'wallet-current',
      transaction_type: 'deposit',
      status: 'completed',
      amount: 20,
      fee: 0,
      net_amount: 20,
      currency: 'FARM',
      description: 'Successful deposit',
      metadata: {},
      wallets_transactions_sender_wallet_idTowallets: null,
      wallets_transactions_receiver_wallet_idTowallets: null,
    };
    const transactionFindFirst = jest.fn().mockResolvedValue(transaction);
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-current' }),
      },
      transactions: { findFirst: transactionFindFirst },
      deposit: { findFirst: jest.fn().mockResolvedValue(null) },
      withdrawal: { findUnique: jest.fn() },
      merchants: { findUnique: jest.fn() },
    };
    const detailedService = new TransactionsService(
      prisma as any,
      { cacheGet: jest.fn(), cacheSet: jest.fn() } as any,
    );

    const result = await detailedService.findOne('user-1', transactionId);

    expect(transactionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: transactionId }, { transaction_reference: transactionId }],
          AND: [
            {
              OR: [
                { sender_wallet_id: 'wallet-current' },
                { receiver_wallet_id: 'wallet-current' },
              ],
            },
          ],
        },
      }),
    );
    expect(result.data.id).toBe(transaction.id);
  });

  it('returns the persisted withdrawal fee and settlement for a transaction receipt', async () => {
    const transaction = {
      id: 'tx-withdrawal',
      transaction_reference: 'withdrawal-reference',
      sender_wallet_id: 'wallet-current',
      receiver_wallet_id: null,
      transaction_type: 'withdrawal',
      status: 'completed',
      amount: 100,
      fee: 1.5,
      net_amount: 98.5,
      currency: 'FARM',
      description: 'Withdrawal',
      metadata: {},
      wallets_transactions_sender_wallet_idTowallets: null,
      wallets_transactions_receiver_wallet_idTowallets: null,
    };
    const withdrawalFindUnique = jest.fn().mockResolvedValue({
      method: 'MPESA',
      cryptoAsset: null,
      network: null,
      fee: 1.5,
      settlement: 98.5,
      status: 'COMPLETED',
      rejectionReason: null,
    });
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-current' }),
      },
      transactions: {
        findFirst: jest.fn().mockResolvedValue(transaction),
      },
      withdrawal: { findUnique: withdrawalFindUnique },
      merchants: { findUnique: jest.fn() },
    };
    const detailedService = new TransactionsService(
      prisma as any,
      { cacheGet: jest.fn(), cacheSet: jest.fn() } as any,
    );

    const result = await detailedService.findOne(
      'user-1',
      'withdrawal-reference',
    );

    expect(withdrawalFindUnique).toHaveBeenCalledWith({
      where: { reference: 'withdrawal-reference' },
      select: {
        method: true,
        cryptoAsset: true,
        network: true,
        fee: true,
        settlement: true,
        status: true,
        rejectionReason: true,
      },
    });
    expect(result.data).toMatchObject({
      fee: 1.5,
      net_amount: 98.5,
      settlement_amount: 98.5,
      withdrawal_status: 'COMPLETED',
    });
  });
});
