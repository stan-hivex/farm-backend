import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EscrowService } from './escrow.service';

describe('EscrowService biometric authorization', () => {
  it('uses device verification instead of PIN when biometric auth is provided', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockRejectedValue(new NotFoundException('Buyer wallet not found')),
      },
    };

    const authService = {
      verifyPin: jest.fn(),
    };

    const securityService = {
      verifyDevice: jest.fn().mockResolvedValue({ trusted: true }),
    };

    const service = new EscrowService(
      prisma as any,
      authService as any,
      {} as any,
      {} as any,
      securityService as any,
    ) as any;

    await expect(
      service.create('buyer-id', {
        seller_identifier: 'seller',
        amount: 10,
        title: 'Test escrow',
        biometric_auth: true,
        device_fingerprint: 'fingerprint',
      } as any),
    ).rejects.toThrow(NotFoundException);

    expect(securityService.verifyDevice).toHaveBeenCalledWith('buyer-id', 'fingerprint');
    expect(authService.verifyPin).not.toHaveBeenCalled();
  });
});

describe('EscrowService dispute resolution', () => {
  it('returns the full escrow principal without refunding the creation fee', async () => {
    const tx: any = {
      escrow_contracts: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      wallets: {
        update: jest.fn().mockResolvedValue({ balance: 100 }),
      },
      transactions: {
        create: jest.fn().mockResolvedValue({
          transaction_reference: 'refund-reference',
        }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((work) => work(tx)),
    };
    const notifications: any = {
      sendNotification: jest.fn().mockResolvedValue({}),
    };
    const websocket: any = {
      emitBalanceUpdate: jest.fn(),
      emitTransactionUpdate: jest.fn(),
    };
    const service = new EscrowService(
      prisma,
      {} as any,
      {} as any,
      notifications,
      {} as any,
      websocket,
    );

    await service.executeRefund(
      {
        id: 'escrow-1',
        amount: 100,
        title: 'Order',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        buyer_wallet_id: 'buyer-wallet',
      },
      { adminId: 'admin-1', note: 'Refund for buyer' },
    );

    expect(tx.wallets.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'buyer-wallet' },
      data: { locked_balance: { decrement: 100 } },
    });
    expect(tx.transactions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 100,
        fee: 0,
        net_amount: 100,
      }),
    });
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'buyer-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          amount: 100,
          refunded_amount: 100,
          creation_fee_refunded: 0,
        }),
      }),
    );
  });

  it('prevents refunding an escrow that has already transitioned', async () => {
    const tx: any = {
      escrow_contracts: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      wallets: { update: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn((work) => work(tx)),
    };
    const service = new EscrowService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.executeRefund(
        { id: 'escrow-1', amount: 50 },
        { adminId: 'admin-1', note: 'Resolve for buyer' },
      ),
    ).rejects.toThrow('Escrow is no longer disputed');

    expect(tx.escrow_contracts.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'escrow-1',
          status: { in: ['disputed'] },
        },
        data: expect.objectContaining({
          status: 'refunded',
          arbiter_id: 'admin-1',
          resolution_note: 'Resolve for buyer',
        }),
      }),
    );
    expect(tx.wallets.update).not.toHaveBeenCalled();
  });
});

describe('EscrowService creation fee', () => {
  it('requires enough available balance for both principal and the 1.5% fee', async () => {
    const prisma: any = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          username: 'buyer',
          wallets: [{ id: 'buyer-wallet', balance: 100, locked_balance: 0 }],
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'seller-1',
          username: 'seller',
          wallets: [{ id: 'seller-wallet' }],
        }),
      },
      escrow_contracts: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const auth: any = { verifyPin: jest.fn().mockResolvedValue(true) };
    const service = new EscrowService(
      prisma,
      auth,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.create('buyer-1', {
        seller_identifier: 'seller',
        amount: 100,
        title: 'Order',
        pin: '1234',
      }),
    ).rejects.toThrow('Insufficient balance. Need 101.5 FARM');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deducts the fee separately and locks the full escrow principal', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ balance: 101.5, locked_balance: 0 }]),
      escrow_contracts: {
        create: jest.fn().mockResolvedValue({ id: 'escrow-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'escrow-1',
          status: 'active',
          amount: 100,
          fee: 1.5,
        }),
      },
      wallets: {
        update: jest.fn()
          .mockResolvedValueOnce({ balance: 100 })
          .mockResolvedValueOnce({ balance: 1.5 }),
      },
      transactions: {
        create: jest.fn().mockResolvedValue({
          transaction_reference: 'escrow-reference',
        }),
      },
      users: {
        findFirst: jest.fn().mockResolvedValue({
          wallets: [{ id: 'superadmin-wallet' }],
        }),
      },
      ledger_entries: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'buyer-1',
          username: 'buyer',
          wallets: [{ id: 'buyer-wallet', balance: 101.5, locked_balance: 0 }],
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'seller-1',
          username: 'seller',
          wallets: [{ id: 'seller-wallet' }],
        }),
      },
      escrow_contracts: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((work) => work(tx)),
    };
    const notifications: any = {
      sendNotification: jest.fn().mockResolvedValue({}),
    };
    const websocket: any = {
      emitBalanceUpdate: jest.fn(),
      emitTransactionUpdate: jest.fn(),
    };
    const service = new EscrowService(
      prisma,
      { verifyPin: jest.fn().mockResolvedValue(true) } as any,
      {} as any,
      notifications,
      {} as any,
      websocket,
    );

    const result = await service.create('buyer-1', {
      seller_identifier: 'seller',
      amount: 100,
      title: 'Order',
      pin: '1234',
    });
    expect(result.data.status).toBe('active');

    expect(prisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'buyer-1' },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    expect(prisma.users.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ username: 'seller' }, { phone: 'seller' }],
        is_deleted: false,
      },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    expect(tx.wallets.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'buyer-wallet' },
      data: {
        balance: { decrement: 1.5 },
        locked_balance: { increment: 100 },
      },
    });
    expect(tx.wallets.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'superadmin-wallet' },
      data: { balance: { increment: 1.5 } },
    });
  });
});

describe('EscrowService release retries', () => {
  it('treats a repeated release of a completed escrow as successful', async () => {
    const prisma = {
      escrow_contracts: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'escrow-1',
          buyer_id: 'buyer-1',
          status: 'completed',
        }),
      },
    };
    const authService = { verifyPin: jest.fn() };
    const service = new EscrowService(
      prisma as any,
      authService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const executeRelease = jest.spyOn(service, 'executeRelease');

    await expect(
      service.release('escrow-1', 'buyer-1', { pin: '1234' }),
    ).resolves.toEqual({ message: 'Escrow has already been released' });

    expect(authService.verifyPin).not.toHaveBeenCalled();
    expect(executeRelease).not.toHaveBeenCalled();
  });

  it('returns success if a concurrent request completes the release first', async () => {
    const prisma = {
      escrow_contracts: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'escrow-1',
            buyer_id: 'buyer-1',
            status: 'active',
          })
          .mockResolvedValueOnce({
            id: 'escrow-1',
            buyer_id: 'buyer-1',
            status: 'completed',
          }),
      },
    };
    const service = new EscrowService(
      prisma as any,
      { verifyPin: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service, 'executeRelease')
      .mockRejectedValue(new BadRequestException('Escrow is no longer active'));

    await expect(
      service.release('escrow-1', 'buyer-1', { pin: '1234' }),
    ).resolves.toEqual({ message: 'Escrow has already been released' });
  });
});
