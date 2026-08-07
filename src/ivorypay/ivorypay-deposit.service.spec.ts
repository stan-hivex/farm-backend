import { Test } from '@nestjs/testing';
import { IvorypayDepositService } from './ivorypay-deposit.service';
import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from './ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

describe('IvorypayDepositService', () => {
  let service: IvorypayDepositService;
  let prisma: any;
  let notifications: any;
  let ivorypay: any;

  beforeEach(async () => {
    prisma = {
      deposit: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      transactions: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      wallets: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      ledger_entries: {
        create: jest.fn(),
      },
      audit_logs: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    notifications = {
      sendNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
    };

    ivorypay = {
      createPayment: jest.fn(),
      verifyTransaction: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        IvorypayDepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: IvorypayService, useValue: ivorypay },
        { provide: NotificationsService, useValue: notifications },
        { provide: WebsocketGateway, useValue: { emitBalanceUpdate: jest.fn(), emitTransactionUpdate: jest.fn() } },
      ],
    }).compile();

    service = module.get(IvorypayDepositService);
  });

  it('ignores a duplicate IvoryPay webhook when the deposit is already completed', async () => {
    prisma.deposit.findFirst.mockResolvedValue({
      id: 'dep-1',
      userId: 'user-1',
      reference: 'ref-1',
      status: 'SUCCESS',
      amount: 100,
      currency: 'FARM',
      provider: 'ivorypay',
    });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      transaction_reference: 'ref-1',
      status: 'completed',
      transaction_type: 'deposit',
      metadata: { provider: 'ivorypay' },
    });

    const result = await service.handleWebhook({
      reference: 'ref-1',
      event: 'payment.success',
      data: { status: 'completed' },
    }, true);

    expect(result).toEqual(expect.objectContaining({ processed: true, duplicate: true }));
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });

  it('does not persist providerRef when Ivorypay returns no external identifiers', async () => {
    const deposit = { id: 'dep-1', userId: 'user-1', reference: 'ref-1' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-1' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://example.com/checkout' },
      providerIdentifiers: {},
      providerReference: null,
    });

    const result = await service.createDeposit('user-1', { amount_fiat: 100, email: 'user@example.com' });

    expect(prisma.deposit.update).not.toHaveBeenCalled();
    expect(prisma.transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          provider_ref: null,
          provider_transaction_id: null,
          provider_reference: null,
        }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ payment_url: 'https://example.com/checkout' }),
    }));
  });

  it('persists providerRef when Ivorypay returns an external transaction ID', async () => {
    const deposit = { id: 'dep-2', userId: 'user-2', reference: 'ref-2' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-2' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://example.com/checkout-2' },
      providerIdentifiers: { transaction_id: 'ivory-123' },
      providerReference: 'ivory-123',
    });

    const result = await service.createDeposit('user-2', { amount_fiat: 100, email: 'user2@example.com' });

    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dep-2' }, data: expect.objectContaining({ providerRef: 'ivory-123' }) }));
    expect(prisma.transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          provider_ref: 'ivory-123',
          provider_transaction_id: 'ivory-123',
          provider_reference: 'ivory-123',
        }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ payment_url: 'https://example.com/checkout-2' }),
    }));
  });

  it('persists providerRef when Ivorypay returns tx_ref as the external identifier', async () => {
    const deposit = { id: 'dep-3', userId: 'user-3', reference: 'ref-3' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-3' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://example.com/checkout-3' },
      providerIdentifiers: { tx_ref: 'ivory-txref-456' },
      providerReference: 'ivory-txref-456',
    });

    const result = await service.createDeposit('user-3', { amount_fiat: 100, email: 'user3@example.com' });

    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dep-3' }, data: expect.objectContaining({ providerRef: 'ivory-txref-456' }) }));
    expect(prisma.transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          provider_ref: 'ivory-txref-456',
          tx_ref: 'ivory-txref-456',
          trxref: null,
          transaction_reference: null,
        }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ payment_url: 'https://example.com/checkout-3' }),
    }));
  });

  it('does not credit wallet until provider verification confirms success', async () => {
    const deposit = { id: 'dep-11', userId: 'user-11', reference: 'ref-11', amount: 50, currency: 'FARM', status: 'PENDING', providerRef: 'ivory-123' };
    prisma.deposit.findFirst.mockResolvedValue(deposit);
    prisma.transactions.findUnique.mockResolvedValue({ id: 'tx-11', transaction_reference: 'ref-11', amount: 50, status: 'pending', transaction_type: 'deposit', metadata: { provider: 'ivorypay', provider_ref: 'ivory-123' } });
    ivorypay.verifyTransaction.mockResolvedValue({ status: 'pending', providerReference: 'ivory-123', providerIdentifiers: { transaction_id: 'ivory-123' }, tx_hash: '0xabc' });

    const result = await service.handleWebhook({ reference: 'ref-11', event: 'payment.success', data: { id: 'ivory-123', reference: 'ref-11', status: 'success', amount: 50 } }, true);

    expect(result).toEqual(expect.objectContaining({ processed: false, reason: 'verification_pending' }));
    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'dep-11' },
      data: expect.objectContaining({ verificationAttempts: 1, verificationPayload: expect.anything(), blockchainTransactionHash: '0xabc' }),
    }));
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });

  it('full flow: persists provider id and processes webhook to credit wallet', async () => {
    const deposit = { id: 'dep-10', userId: 'user-10', reference: 'ref-10', amount: 50, currency: 'FARM', status: 'PENDING' };
    prisma.deposit.create.mockResolvedValue(deposit);
    prisma.transactions.create.mockResolvedValue({ id: 'tx-10', transaction_reference: 'ref-10', amount: 50, status: 'pending', metadata: { provider: 'ivorypay' } });

    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://checkout.example/10', id: 'ip_tx_123456', reference: 'IVP-98765' },
      providerIdentifiers: { transaction_id: 'ip_tx_123456', id: 'ip_tx_123456' },
      providerReference: 'ip_tx_123456',
    });

    // createDeposit should persist providerRef
    const result = await service.createDeposit('user-10', { amount_fiat: 50, email: 'user10@example.com' });
    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dep-10' }, data: expect.objectContaining({ providerRef: 'ip_tx_123456' }) }));

    // Prepare webhook handling: find deposit and transaction, wallet exists
    prisma.deposit.findFirst.mockResolvedValue({ ...deposit, providerRef: 'ip_tx_123456' });
    prisma.transactions.findUnique.mockResolvedValue({ id: 'tx-10', transaction_reference: 'ref-10', amount: 50, status: 'pending', metadata: { provider: 'ivorypay', provider_ref: 'ip_tx_123456' } });
    prisma.wallets.findFirst.mockResolvedValue({ id: 'w-10', user_id: 'user-10', balance: 100 });

    // Mock verifyTransaction to return success using provider id
    ivorypay.verifyTransaction.mockResolvedValue({ status: 'success', providerReference: 'ip_tx_123456', providerIdentifiers: { transaction_id: 'ip_tx_123456' } });

    const payload = { data: { id: 'ip_tx_123456', reference: 'IVP-98765', status: 'success', amount: 50 }, event: 'payment.success' };

    const webhookResult = await service.handleWebhook(payload, true);
    expect(webhookResult).toEqual(expect.objectContaining({ processed: true, status: 'completed' }));
    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dep-10' }, data: expect.objectContaining({ status: 'SUCCESS' }) }));
    expect(prisma.wallets.update).toHaveBeenCalled();
  });

  it('credits the wallet when verification succeeds with a different provider identifier', async () => {
    const deposit = { id: 'dep-12', userId: 'user-12', reference: 'ref-12', amount: 50, currency: 'FARM', status: 'PENDING', providerRef: 'old-id' };
    prisma.deposit.findFirst.mockResolvedValue(deposit);
    prisma.transactions.findUnique.mockResolvedValue({ id: 'tx-12', transaction_reference: 'ref-12', amount: 50, status: 'pending', metadata: { provider: 'ivorypay', provider_ref: 'old-id' } });
    prisma.wallets.findFirst.mockResolvedValue({ id: 'w-12', user_id: 'user-12', balance: 60 });
    ivorypay.verifyTransaction.mockResolvedValue({ status: 'success', providerReference: 'new-id', providerIdentifiers: { transaction_id: 'new-id' } });

    const result = await service.handleWebhook({ reference: 'ref-12', event: 'payment.success', data: { id: 'new-id', reference: 'ref-12', status: 'success', amount: 50 } }, true);

    expect(result).toEqual(expect.objectContaining({ processed: true, status: 'completed' }));
    expect(prisma.wallets.update).toHaveBeenCalled();
    expect(prisma.deposit.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dep-12' }, data: expect.objectContaining({ status: 'SUCCESS' }) }));
  });
});
