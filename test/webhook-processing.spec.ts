import { WebhookService } from '../src/webhook/webhook.service';

describe('WebhookService processing', () => {
  let svc: WebhookService;
  const mockPrisma: any = {
    transactions: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    deposit: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    wallets: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'wallet-1', user_id: 'user-1', balance: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    ledger_entries: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
  };
  const mockDepositService: any = {
    failDeposit: jest.fn().mockResolvedValue(true),
    finalizeSuccessfulDeposit: jest.fn().mockResolvedValue(true),
  };
  const mockWithdrawService: any = {};
  const mockWebsocket: any = { emitBalanceUpdate: jest.fn(), emitTransactionUpdate: jest.fn(), server: { emit: jest.fn() } };
  const mockCfg: any = { get: (k: string, d?: any) => d };
  const mockPaystackService: any = { verifyTransaction: jest.fn() };
  const mockIvorypayService: any = {};
  const mockQueue: any = { add: jest.fn().mockResolvedValue(true) };
  const mockRedis: any = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new WebhookService(
      mockPrisma,
      mockDepositService,
      mockWithdrawService,
      mockWebsocket,
      mockCfg,
      mockPaystackService,
      mockIvorypayService,
      mockQueue,
      mockRedis,
    );
  });

  it('calls failDeposit on failure event', async () => {
    const payload = { event: 'charge.failed', data: { reference: 'ref-1', gateway_response: 'declined' } } as any;
    // acquireLock uses redis.set; ensure it returns OK
    await svc.handlePaystackWebhookProcessing(payload);
    expect(mockDepositService.failDeposit).toHaveBeenCalledWith('ref-1', expect.any(String));
    expect(mockDepositService.finalizeSuccessfulDeposit).not.toHaveBeenCalled();
  });

  it('skips finalize when paystack verify reports non-success', async () => {
    mockPaystackService.verifyTransaction.mockResolvedValue({ status: 'failed' });
    const payload = { event: 'charge.success', data: { reference: 'ref-2', amount: 1000 } } as any;
    await svc.handlePaystackWebhookProcessing(payload);
    expect(mockPaystackService.verifyTransaction).toHaveBeenCalledWith('ref-2');
    expect(mockDepositService.finalizeSuccessfulDeposit).not.toHaveBeenCalled();
  });

  it('calls finalize when paystack verify reports success', async () => {
    mockPaystackService.verifyTransaction.mockResolvedValue({ status: 'success' });
    const payload = { event: 'charge.success', data: { reference: 'ref-3', amount: 1000 } } as any;
    await svc.handlePaystackWebhookProcessing(payload);
    expect(mockPaystackService.verifyTransaction).toHaveBeenCalledWith('ref-3');
    expect(mockDepositService.finalizeSuccessfulDeposit).toHaveBeenCalledWith('ref-3');
  });

  it('resolves Ivorypay deposits from transaction metadata when the webhook uses provider identifiers', async () => {
    const internalReference = 'internal-ref-100';
    const providerReference = 'provider-ref-100';
    const transaction = {
      id: 42,
      transaction_reference: internalReference,
      amount: 100,
      status: 'pending',
      transaction_type: 'deposit',
      metadata: { provider_ref: providerReference, user_id: 'user-1' },
    };

    mockPrisma.transactions.findUnique.mockImplementation(({ where }: any) => {
      if (where.transaction_reference === internalReference) return Promise.resolve(transaction);
      return Promise.resolve(null);
    });
    mockPrisma.transactions.findFirst.mockResolvedValue(null);
    mockPrisma.deposit.findFirst.mockResolvedValue({ id: 1, reference: internalReference, status: 'PENDING', userId: 'user-1', currency: 'FARM' });
    mockPrisma.deposit.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockIvorypayService.verifyTransaction = jest.fn().mockResolvedValue({ status: 'completed', amount: 100, providerIdentifiers: { transaction_id: providerReference } });

    const payload = { event: 'payment.success', data: { reference: providerReference, amount: 100 } } as any;
    await svc.handleIvorypayWebhookProcessing(payload);

    expect(mockPrisma.transactions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({
              path: ['provider_ref'],
              equals: providerReference,
            }),
          }),
        ]),
      }),
    }));
    expect(mockIvorypayService.verifyTransaction).toHaveBeenCalled();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
