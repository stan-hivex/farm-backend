import { Test } from '@nestjs/testing';
import { IvorypayDepositService } from './ivorypay-deposit.service';
import { PrismaService } from '../database/prisma.service';
import { IvorypayService } from './ivorypay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { CacheService } from '../common/cache/cache.service';

describe('IvorypayDepositService', () => {
  let service: IvorypayDepositService;
  let prisma: any;
  let notifications: any;
  let ivorypay: any;
  let websocket: any;
  let cache: any;

  beforeEach(async () => {
    prisma = {
      deposit: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    websocket = {
      emitBalanceUpdate: jest.fn(),
      emitTransactionUpdate: jest.fn(),
    };
    cache = {
      cacheDelete: jest.fn().mockResolvedValue(undefined),
      cacheInvalidatePattern: jest.fn().mockResolvedValue(undefined),
      invalidateWallet: jest.fn().mockResolvedValue(undefined),
    };
    ivorypay = {
      createPayment: jest.fn(),
      verifyTransaction: jest.fn(),
      getSupportedPaymentOptions: jest.fn().mockResolvedValue([
        { token: 'USDT', network: 'BSC', networkName: 'BSC' },
        { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      ]),
      getSupportedPaymentTokens: jest.fn().mockResolvedValue(['USDC', 'USDT']),
    };

    const module = await Test.createTestingModule({
      providers: [
        IvorypayDepositService,
        { provide: PrismaService, useValue: prisma },
        { provide: IvorypayService, useValue: ivorypay },
        { provide: NotificationsService, useValue: notifications },
        { provide: WebsocketGateway, useValue: websocket },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(IvorypayDepositService);
  });

  it('initializes checkout with the selected active token and network', async () => {
    prisma.deposit.create.mockResolvedValue({ id: 'dep-1' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://checkout.ivorypay.io/checkout/ref' },
      payment_link: 'https://checkout.ivorypay.io/checkout/ref',
    });

    const result = await service.createDeposit('user-1', {
      amount_fiat: 100,
      crypto: 'USDC',
      chain: 'POLYGON',
    });

    expect(ivorypay.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        crypto: 'USDC',
        chain: 'POLYGON',
        baseFiat: 'USD',
        redirect_url: 'https://farmapp.africa/payment-callback',
      }),
    );
    expect(result.data.payment_url).toBe(
      'https://checkout.ivorypay.io/checkout/ref',
    );
    expect(prisma.deposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dep-1' },
        data: { providerRef: expect.any(String) },
      }),
    );
  });

  it('returns the supported payment tokens and their active networks', async () => {
    await expect(service.getSupportedPaymentTokens()).resolves.toEqual({
      success: true,
      data: ['USDC', 'USDT'],
      options: [
        { token: 'USDT', network: 'BSC', networkName: 'BSC' },
        { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      ],
    });
    expect(ivorypay.getSupportedPaymentOptions).toHaveBeenCalledTimes(1);
  });

  it('requires a supported token and validates any selected network', async () => {
    await expect(
      service.createDeposit('user-1', { amount_fiat: 100 }),
    ).rejects.toThrow(
      'Choose a cryptocurrency before creating an IvoryPay deposit',
    );
    await expect(
      service.createDeposit('user-1', {
        amount_fiat: 100,
        crypto: 'DAI',
      }),
    ).rejects.toThrow('The selected crypto token is not enabled for IvoryPay');
    await expect(
      service.createDeposit('user-1', {
        amount_fiat: 100,
        crypto: 'USDT',
        chain: 'ETHEREUM',
      }),
    ).rejects.toThrow(
      'The selected crypto token and network are not enabled for IvoryPay',
    );

    expect(prisma.deposit.create).not.toHaveBeenCalled();
    expect(ivorypay.createPayment).not.toHaveBeenCalled();
  });

  it('pins checkout to an enabled network when the client omits one', async () => {
    prisma.deposit.create.mockResolvedValue({ id: 'dep-1' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://checkout.ivorypay.io/checkout/ref' },
      payment_link: 'https://checkout.ivorypay.io/checkout/ref',
    });

    await service.createDeposit('user-1', {
      amount_fiat: 100,
      crypto: 'USDT',
    });

    const paymentOptions = ivorypay.createPayment.mock.calls[0][0];
    expect(paymentOptions).toHaveProperty('crypto', 'USDT');
    expect(paymentOptions).toHaveProperty('chain', 'BSC');
    expect(ivorypay.getSupportedPaymentOptions).toHaveBeenCalled();
  });

  it('marks the deposit failed when IvoryPay rejects checkout initialization', async () => {
    prisma.deposit.create.mockResolvedValue({ id: 'dep-1' });
    ivorypay.createPayment.mockRejectedValue(
      new Error('IvoryPay integration failed: Invalid Data'),
    );

    await expect(
      service.createDeposit('user-1', {
        amount_fiat: 100,
        crypto: 'USDT',
      }),
    ).rejects.toThrow('IvoryPay integration failed: Invalid Data');

    expect(prisma.deposit.update).toHaveBeenCalledWith({
      where: { id: 'dep-1' },
      data: { status: 'FAILED' },
    });
    expect(prisma.transactions.create).not.toHaveBeenCalled();
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

  it('credits the wallet once and invalidates its cache after a successful webhook', async () => {
    const deposit = {
      id: 'dep-2',
      userId: 'user-2',
      reference: 'ref-2',
      status: 'PENDING',
      amount: 100,
      currency: 'FARM',
      provider: 'ivorypay',
    };
    const transaction = {
      id: 'tx-2',
      transaction_reference: 'ref-2',
      status: 'pending',
      transaction_type: 'deposit',
      amount: 100,
      metadata: { provider: 'ivorypay' },
    };
    prisma.deposit.findFirst.mockResolvedValue(deposit);
    prisma.transactions.findUnique.mockResolvedValue(transaction);
    ivorypay.verifyTransaction.mockResolvedValue({
      reference: 'ref-2',
      status: 'SUCCESS',
    });
    prisma.wallets.findFirst.mockResolvedValue({
      id: 'wallet-2',
      user_id: 'user-2',
      balance: 50,
      locked_balance: 0,
    });
    prisma.wallets.update.mockResolvedValue({
      id: 'wallet-2',
      balance: 150,
      locked_balance: 0,
    });

    await service.handleWebhook(
      {
        reference: 'ref-2',
        event: 'cryptoCollection.success',
        data: { reference: 'ref-2', status: 'SUCCESS' },
      },
      true,
    );

    expect(prisma.deposit.updateMany).toHaveBeenCalledWith({
      where: { id: 'dep-2', status: 'PENDING' },
      data: { status: 'SUCCESS' },
    });
    expect(prisma.wallets.update).toHaveBeenCalledWith({
      where: { id: 'wallet-2' },
      data: { balance: { increment: 100 } },
    });
    expect(cache.invalidateWallet).toHaveBeenCalledWith('user-2');
    expect(websocket.emitBalanceUpdate).toHaveBeenCalledWith('user-2', 150);
    expect(ivorypay.verifyTransaction).toHaveBeenCalledWith(
      'ref-2',
      undefined,
      ['ref-2'],
    );
  });

  it('does not credit a success webhook until IvoryPay confirms success', async () => {
    prisma.deposit.findFirst.mockResolvedValue({
      id: 'dep-3',
      userId: 'user-3',
      reference: 'ref-3',
      status: 'PENDING',
      amount: 100,
      currency: 'FARM',
      provider: 'ivorypay',
      providerRef: 'provider-ref-3',
    });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-3',
      transaction_reference: 'ref-3',
      status: 'pending',
      transaction_type: 'deposit',
      amount: 100,
      metadata: { provider: 'ivorypay' },
    });
    ivorypay.verifyTransaction.mockResolvedValue({
      reference: 'ref-3',
      status: 'PENDING',
    });

    const result = await service.handleWebhook(
      {
        event: 'cryptoCollection.success',
        data: { reference: 'ref-3', status: 'SUCCESS' },
      },
      true,
    );

    expect(result).toEqual({
      processed: false,
      reason: 'provider_status_not_success',
      reference: 'ref-3',
    });
    expect(prisma.deposit.updateMany).not.toHaveBeenCalled();
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });

  it('verifies the provider transaction before processing a successful deposit', async () => {
    const pendingDeposit = {
      id: 'dep-1',
      userId: 'user-1',
      reference: 'ref-1',
      provider: 'ivorypay',
      providerRef: 'provider-ref-1',
      status: 'PENDING',
    };
    prisma.deposit.findFirst
      .mockResolvedValueOnce(pendingDeposit)
      .mockResolvedValueOnce({ status: 'SUCCESS' });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      transaction_reference: 'ref-1',
      transaction_type: 'deposit',
      metadata: { amount_crypto: 25, crypto: 'USDT' },
    });
    const verifyTransaction = jest.fn().mockResolvedValue({
      reference: 'ref-1',
      status: 'SUCCESS',
      token: 'USDT',
      expectedAmountInCrypto: 25,
    });
    (service as any).ivorypayService.verifyTransaction = verifyTransaction;
    const handleWebhook = jest
      .spyOn(service, 'handleWebhook')
      .mockResolvedValue({ processed: true, reference: 'ref-1' } as any);

    await expect(service.verifyDeposit('user-1', 'ref-1')).resolves.toEqual({
      success: true,
      data: { reference: 'ref-1', status: 'SUCCESS' },
    });

    expect(verifyTransaction).toHaveBeenCalledWith(
      'ref-1',
      'provider-ref-1',
      ['ref-1'],
    );
    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'cryptoCollection.success',
        reference: 'ref-1',
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
      true,
      expect.objectContaining({
        reference: 'ref-1',
        status: 'SUCCESS',
      }),
    );
  });

  it('does not process a provider-verified payment when its amount mismatches', async () => {
    prisma.deposit.findFirst.mockResolvedValue({
      id: 'dep-1',
      userId: 'user-1',
      reference: 'ref-1',
      provider: 'ivorypay',
      providerRef: 'provider-ref-1',
      status: 'PENDING',
    });
    prisma.transactions.findUnique.mockResolvedValue({
      id: 'tx-1',
      transaction_reference: 'ref-1',
      transaction_type: 'deposit',
      metadata: { amount_crypto: 25, crypto: 'USDT' },
    });
    (service as any).ivorypayService.verifyTransaction = jest
      .fn()
      .mockResolvedValue({
        reference: 'ref-1',
        status: 'SUCCESS',
        token: 'USDT',
        expectedAmountInCrypto: 24,
      });
    const handleWebhook = jest.spyOn(service, 'handleWebhook');

    await expect(service.verifyDeposit('user-1', 'ref-1')).rejects.toThrow(
      'IvoryPay verified amount does not match the pending deposit',
    );
    expect(handleWebhook).toHaveBeenCalled();
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });
});
