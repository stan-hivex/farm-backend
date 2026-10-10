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
      getSupportedPaymentOptions: jest.fn().mockResolvedValue([
        { token: 'USDT', network: 'BSC', networkName: 'BSC' },
        { token: 'USDC', network: 'POLYGON', networkName: 'Polygon' },
      ]),
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

  it('lets IvoryPay checkout choose the crypto token and network by default', async () => {
    prisma.deposit.create.mockResolvedValue({ id: 'dep-1' });
    ivorypay.createPayment.mockResolvedValue({
      data: { payment_link: 'https://checkout.ivorypay.io/checkout/ref' },
      payment_link: 'https://checkout.ivorypay.io/checkout/ref',
    });

    await service.createDeposit('user-1', { amount_fiat: 100 });

    const paymentOptions = ivorypay.createPayment.mock.calls[0][0];
    expect(paymentOptions).not.toHaveProperty('crypto');
    expect(paymentOptions).not.toHaveProperty('chain');
    expect(paymentOptions.metadata).not.toHaveProperty('crypto');
    expect(paymentOptions.metadata).not.toHaveProperty('chain');
    expect(ivorypay.getSupportedPaymentOptions).not.toHaveBeenCalled();
  });

  it('rejects a crypto token/network pair that IvoryPay has not enabled', async () => {
    await expect(
      service.createDeposit('user-1', {
        amount_fiat: 100,
        crypto: 'DAI',
        chain: 'ETHEREUM',
      }),
    ).rejects.toThrow(
      'The selected crypto token and network are not enabled for IvoryPay',
    );

    expect(prisma.deposit.create).not.toHaveBeenCalled();
    expect(ivorypay.createPayment).not.toHaveBeenCalled();
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
        chain: 'BSC',
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
      metadata: { amount_usd: 25 },
    });
    const verifyTransaction = jest.fn().mockResolvedValue({
      reference: 'provider-ref-1',
      status: 'SUCCESS',
      amount: 25,
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
        event: 'payment.success',
        reference: 'ref-1',
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
      true,
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
      metadata: { amount_usd: 25 },
    });
    (service as any).ivorypayService.verifyTransaction = jest
      .fn()
      .mockResolvedValue({
        reference: 'provider-ref-1',
        status: 'SUCCESS',
        amount: 24,
      });
    const handleWebhook = jest.spyOn(service, 'handleWebhook');

    await expect(service.verifyDeposit('user-1', 'ref-1')).rejects.toThrow(
      'IvoryPay verified amount does not match the pending deposit',
    );
    expect(handleWebhook).not.toHaveBeenCalled();
  });
});
