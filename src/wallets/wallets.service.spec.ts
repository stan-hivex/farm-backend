import { WalletsService } from './wallets.service';

describe('WalletsService transaction history', () => {
  it('excludes unsuccessful transactions from user history queries', async () => {
    const prisma = {
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      },
      transactions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new WalletsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {
        cacheGet: jest.fn().mockResolvedValue(null),
        cacheSet: jest.fn().mockResolvedValue(undefined),
      } as any,
    );

    await service.getTransactions('user-1', { page: 1, limit: 10 });

    const query = prisma.transactions.findMany.mock.calls[0][0];
    expect(query.where.AND).toContainEqual({
      status: expect.objectContaining({
        notIn: expect.arrayContaining([
          'pending',
          'processing',
          'failed',
          'cancelled',
          'reversed',
        ]),
      }),
    });
    expect(prisma.transactions.count).toHaveBeenCalledWith({
      where: query.where,
    });
  });
});

describe('WalletsService transaction history filters', () => {
  it('keeps the hidden-status filter and caches per type/status filter', async () => {
    const prisma = {
      wallets: { findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      transactions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const cache = {
      cacheGet: jest.fn().mockResolvedValue(null),
      cacheSet: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WalletsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      cache as any,
    );

    await service.getTransactions('user-1', {
      page: 1,
      limit: 10,
      type: 'transfer',
      status: 'completed',
    });

    const query = prisma.transactions.findMany.mock.calls[0][0];
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        { status: expect.objectContaining({ notIn: expect.any(Array) }) },
        { transaction_type: 'transfer' },
        { status: 'completed' },
      ]),
    );
    expect(cache.cacheGet).toHaveBeenCalledWith(
      'transactions:user-1:1:10:transfer:completed',
    );
  });
});
