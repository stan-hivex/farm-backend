import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { WebhookService } from '../src/webhook/webhook.service';
import { randomUUID } from 'crypto';

jest.setTimeout(60000);

describe('Ivorypay webhook integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let webhookService: WebhookService;
  const userSuffix = randomUUID().slice(0, 8);
  const reference = `test-ivorypay-usd-${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    webhookService = moduleFixture.get<WebhookService>(WebhookService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('credits wallet with FARM when Ivorypay webhook delivers USD success', async () => {
    const email = `test-${userSuffix}@example.com`;
    const phone = `+2547${Date.now().toString().slice(-8)}`;
    const user = await prisma.users.create({
      data: {
        first_name: 'Ivorypay',
        last_name: 'User',
        username: `ivorypay_${userSuffix}`,
        email,
        phone,
        password_hash: 'test-password-hash',
      },
    });

    await prisma.transactions.create({
      data: {
        transaction_reference: reference,
        transaction_type: 'deposit',
        status: 'pending',
        amount: 130,
        fee: 0,
        net_amount: 130,
        currency: 'FARM',
        description: 'Test Ivorypay crypto deposit',
        metadata: {
          provider: 'ivorypay',
          amount_farm: 130,
          amount_usd: 1,
          farm_to_usd_rate: 130,
          currency_fiat: 'USD',
          user_id: user.id,
          payment_method: 'CRYPTO',
        },
      },
    });

    await prisma.deposit.create({
      data: {
        userId: user.id,
        amount: 130,
        fee: 0,
        total: 130,
        currency: 'FARM',
        paymentMethod: 'CRYPTO',
        provider: 'ivorypay',
        reference,
        status: 'PENDING',
      },
    });

    const payload = {
      event: 'payment.success',
      data: {
        reference,
        amount: 1,
        status: 'success',
      },
    };

    await webhookService.handleIvorypayWebhookProcessing(payload);

    const wallet = await prisma.wallets.findFirst({ where: { user_id: user.id, is_active: true } });
    const deposit = await prisma.deposit.findUnique({ where: { reference } });
    const transaction = await prisma.transactions.findUnique({ where: { transaction_reference: reference } });

    expect(wallet).toBeDefined();
    expect(Number(wallet?.balance ?? 0)).toBeCloseTo(130);
    expect(deposit?.status).toBe('SUCCESS');
    expect(transaction?.status).toBe('completed');

    await prisma.ledger_entries.deleteMany({ where: { wallet_id: wallet?.id } });
    await prisma.transactions.deleteMany({ where: { transaction_reference: reference } });
    await prisma.deposit.deleteMany({ where: { reference } });
    await prisma.wallets.deleteMany({ where: { user_id: user.id } });
    await prisma.users.deleteMany({ where: { id: user.id } });
  }, 60000);

  it('does not credit wallet when Ivorypay webhook delivers USD failure', async () => {
    const failureReference = `test-ivorypay-usd-fail-${Date.now()}`;
    const email = `fail-${userSuffix}@example.com`;
    const phone = `+2547${(Date.now() + 1).toString().slice(-8)}`;
    const user = await prisma.users.create({
      data: {
        first_name: 'Ivorypay',
        last_name: 'Failure',
        username: `ivorypay_fail_${userSuffix}`,
        email,
        phone,
        password_hash: 'test-password-hash',
      },
    });

    await prisma.transactions.create({
      data: {
        transaction_reference: failureReference,
        transaction_type: 'deposit',
        status: 'pending',
        amount: 130,
        fee: 0,
        net_amount: 130,
        currency: 'FARM',
        description: 'Test Ivorypay crypto deposit failure',
        metadata: {
          provider: 'ivorypay',
          amount_farm: 130,
          amount_usd: 1,
          farm_to_usd_rate: 130,
          currency_fiat: 'USD',
          user_id: user.id,
          payment_method: 'CRYPTO',
        },
      },
    });

    await prisma.deposit.create({
      data: {
        userId: user.id,
        amount: 130,
        fee: 0,
        total: 130,
        currency: 'FARM',
        paymentMethod: 'CRYPTO',
        provider: 'ivorypay',
        reference: failureReference,
        status: 'PENDING',
      },
    });

    const payload = {
      event: 'payment.failed',
      data: {
        reference: failureReference,
        amount: 1,
        status: 'failed',
        reason: 'Payment declined',
      },
    };

    await webhookService.handleIvorypayWebhookProcessing(payload);

    const wallet = await prisma.wallets.findFirst({ where: { user_id: user.id, is_active: true } });
    const deposit = await prisma.deposit.findUnique({ where: { reference: failureReference } });
    const transaction = await prisma.transactions.findUnique({ where: { transaction_reference: failureReference } });

    expect(wallet).toBeNull();
    expect(deposit?.status).toBe('FAILED');
    expect(transaction?.status).toBe('failed');

    await prisma.transactions.deleteMany({ where: { transaction_reference: failureReference } });
    await prisma.deposit.deleteMany({ where: { reference: failureReference } });
    await prisma.users.deleteMany({ where: { id: user.id } });
  }, 60000);
});
