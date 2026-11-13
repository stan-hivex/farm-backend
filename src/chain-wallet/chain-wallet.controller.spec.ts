import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ExecutionContext,
  Logger,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { SafeInputValidationPipe } from '../common/pipes/safe-input.pipe';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { evaluateBackfillSend } from '../ops/backfill-wallets-policy';
import { ChainWalletService } from './chain-wallet.service';
import {
  AdminChainController,
  BackfillWalletsBody,
  toPublicBackfillException,
} from './chain-wallet.controller';

const ACTOR = { id: '11111111-1111-4111-8111-111111111111' };

function guardContext(user?: { id: string; role: string }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers: {},
        body: {},
        params: {},
        query: {},
      }),
    }),
    getHandler: () => AdminChainController.prototype.backfillWallets,
    getClass: () => AdminChainController,
  } as unknown as ExecutionContext;
}

describe('AdminChainController wallet backfill auth', () => {
  const handler = AdminChainController.prototype.backfillWallets;

  it('is POST /admin/chain/wallets/backfill for SUPER_ADMIN only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminChainController)).toBe(
      'admin/chain',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'wallets/backfill',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);

    const guards = [
      ...(Reflect.getMetadata(GUARDS_METADATA, AdminChainController) ?? []),
      ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
    ];
    expect(guards).toEqual(expect.arrayContaining([JwtGuard, RolesGuard]));

    const reflector = new Reflector();
    expect(
      reflector.getAllAndOverride(ROLES_KEY, [handler, AdminChainController]),
    ).toEqual([UserRole.SUPER_ADMIN]);
    expect(
      reflector.getAllAndOverride(PERMISSIONS_KEY, [
        handler,
        AdminChainController,
      ]),
    ).toEqual(['admin:write']);
  });

  it('rejects missing, user, and admin callers and allows super_admin', async () => {
    const guard = new RolesGuard(new Reflector());
    await expect(guard.canActivate(guardContext())).rejects.toThrow(
      /Authentication token is required/,
    );
    await expect(
      guard.canActivate(guardContext({ id: 'u', role: 'user' })),
    ).rejects.toThrow(/Insufficient role permissions/);
    await expect(
      guard.canActivate(guardContext({ id: 'a', role: 'admin' })),
    ).rejects.toThrow(/Insufficient role permissions/);
    await expect(
      guard.canActivate(guardContext({ id: 'a', role: 'ADMIN' })),
    ).rejects.toThrow(/Insufficient role permissions/);
    await expect(
      guard.canActivate(
        guardContext({ id: ACTOR.id, role: UserRole.SUPER_ADMIN }),
      ),
    ).resolves.toBe(true);
  });
});

describe('AdminChainController wallet backfill request', () => {
  function build() {
    const operatorBackfillWallets = jest.fn(
      async (input: {
        mode: 'dry' | 'send';
        limit: number;
        expectCount?: number;
        actorId?: string | null;
      }) => {
        const selected = 4;
        const decision = evaluateBackfillSend({
          mode: input.mode,
          selected,
          expectCount: input.expectCount,
        });
        if (!decision.ok) throw new BadRequestException(decision.reason);
        return { mode: input.mode, selected, funder_enough: true };
      },
    );
    const controller = new AdminChainController(
      { operatorBackfillWallets } as unknown as ChainWalletService,
      {} as any,
    );
    return { controller, operatorBackfillWallets };
  }

  it('defaults to a dry run of 25 and forwards the super admin id', async () => {
    const { controller, operatorBackfillWallets } = build();
    await expect(
      controller.backfillWallets(
        ACTOR,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    ).resolves.toMatchObject({ mode: 'dry', selected: 4 });
    expect(operatorBackfillWallets).toHaveBeenCalledWith({
      mode: 'dry',
      limit: 25,
      expectCount: undefined,
      actorId: ACTOR.id,
    });
  });

  it('accepts mode=send with expect_count or expectCount and caps limit at 100', async () => {
    const { controller, operatorBackfillWallets } = build();
    await controller.backfillWallets(
      ACTOR,
      'send',
      '4',
      '4',
      undefined,
      undefined,
    );
    await controller.backfillWallets(
      ACTOR,
      undefined,
      undefined,
      undefined,
      undefined,
      { mode: 'SEND', limit: 1000, expectCount: 4 },
    );
    expect(operatorBackfillWallets).toHaveBeenNthCalledWith(1, {
      mode: 'send',
      limit: 4,
      expectCount: 4,
      actorId: ACTOR.id,
    });
    expect(operatorBackfillWallets).toHaveBeenNthCalledWith(2, {
      mode: 'send',
      limit: 100,
      expectCount: 4,
      actorId: ACTOR.id,
    });
  });

  it('refuses send when expectCount is missing or does not match the dry-run selected count', async () => {
    const { controller, operatorBackfillWallets } = build();
    await expect(
      controller.backfillWallets(
        ACTOR,
        'send',
        '4',
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(/expect-count/);
    await expect(
      controller.backfillWallets(ACTOR, 'send', '4', '9', undefined, undefined),
    ).rejects.toThrow(/does not match dry-run selected count 4/);
    expect(operatorBackfillWallets).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'send', limit: 4, expectCount: 9 }),
    );
  });

  it('refuses conflicting params before any wallet work', async () => {
    const { controller, operatorBackfillWallets } = build();
    await expect(
      controller.backfillWallets(ACTOR, 'dry', '4', '5', undefined, {
        mode: 'send',
        expectCount: 4,
      }),
    ).rejects.toThrow(/mode/);
    await expect(
      controller.backfillWallets(ACTOR, undefined, '10', '4', undefined, {
        limit: 4,
        expect_count: 5,
      }),
    ).rejects.toThrow(/limit/);
    await expect(
      controller.backfillWallets(ACTOR, 'send', '4', '4', '5', undefined),
    ).rejects.toThrow(/disagree/);
    await expect(
      controller.backfillWallets(
        ACTOR,
        undefined,
        '0',
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(/1 to 100/);
    expect(operatorBackfillWallets).not.toHaveBeenCalled();
  });

  it('treats execute as dry if it ever reaches the handler', async () => {
    const { controller, operatorBackfillWallets } = build();
    await controller.backfillWallets(
      ACTOR,
      'execute',
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(operatorBackfillWallets).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'dry' }),
    );
  });

  it('does not leak database URLs or unexpected error text', async () => {
    const { controller, operatorBackfillWallets } = build();
    const logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      operatorBackfillWallets.mockRejectedValueOnce(
        new Error(
          'connect ECONNREFUSED postgres://farm:secret@db.internal:5432/farm',
        ),
      );
      await expect(
        controller.backfillWallets(
          ACTOR,
          'dry',
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).rejects.toThrow('Wallet backfill failed');

      operatorBackfillWallets.mockRejectedValueOnce(
        new BadRequestException(
          'refused postgres://farm:secret@db.internal/farm',
        ),
      );
      await expect(
        controller.backfillWallets(
          ACTOR,
          'dry',
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(/\[redacted\]/);
      expect(logged.mock.calls.join(' ')).not.toMatch(/postgres:\/\//);
      expect(logged.mock.calls.join(' ')).toContain('[redacted]');
    } finally {
      logged.mockRestore();
    }
  });
});

describe('wallet backfill SafeInputValidationPipe', () => {
  const safe = new SafeInputValidationPipe();
  const validation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const meta = { type: 'body', metatype: BackfillWalletsBody } as any;

  it('accepts mode=send, limit, expect_count, and expectCount', async () => {
    const body = { mode: 'send', limit: 4, expect_count: 4, expectCount: 4 };
    const screened = safe.transform({ ...body }, meta);
    await expect(validation.transform(screened, meta)).resolves.toMatchObject(
      body,
    );
    expect(safe.transform('send', { type: 'query', data: 'mode' })).toBe(
      'send',
    );
    expect(safe.transform('dry', { type: 'query', data: 'mode' })).toBe('dry');
    expect(safe.transform('4', { type: 'query', data: 'limit' })).toBe('4');
    expect(safe.transform('4', { type: 'query', data: 'expect_count' })).toBe(
      '4',
    );
    expect(safe.transform('4', { type: 'query', data: 'expectCount' })).toBe(
      '4',
    );
  });

  it('rejects mode=execute because that keyword is in the global block list', () => {
    expect(() =>
      safe.transform('execute', { type: 'query', data: 'mode' }),
    ).toThrow(BadRequestException);
    expect(() =>
      safe.transform({ mode: 'execute', limit: 4, expect_count: 4 }, meta),
    ).toThrow(BadRequestException);
    expect(() =>
      safe.transform({ mode: 'send', note: 'drop table users' }, meta),
    ).toThrow(BadRequestException);
  });

  it('whitelist rejects fields outside the backfill body', async () => {
    await expect(
      validation.transform(
        safe.transform({ mode: 'send', limit: 4, sneak: '1' }, meta),
        meta,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('toPublicBackfillException', () => {
  it('keeps a normal policy refusal and hides unknown failures', () => {
    const policy = new BadRequestException(
      'Refusing send: --expect-count 9 does not match dry-run selected count 4',
    );
    expect(toPublicBackfillException(policy)).toBe(policy);
    const hidden = toPublicBackfillException(
      new Error('password=hunter2 postgres://u:p@h/db'),
    );
    expect(hidden.getStatus()).toBe(503);
    expect(JSON.stringify(hidden.getResponse())).not.toMatch(
      /hunter2|postgres:\/\//,
    );
  });
});

const KEY = randomBytes(32).toString('base64');
const ENV: Record<string, string> = {
  CHAIN_WALLETS_ENABLED: 'true',
  ALGORAND_NETWORK: 'testnet',
  ALGORAND_NODE_URL: 'https://node.example',
  ALGORAND_INDEXER_URL: 'https://idx.example',
  ALGORAND_FUNDER_MNEMONIC: 'x',
  FARM_RESERVE_ADDRESS: 'R'.repeat(58),
  WALLET_KEY_ENCRYPTION_KEY: KEY,
  USDC_ASA_ID: '10458941',
  FARM_ASA_ID: '42',
  CHAIN_WALLET_FUND_MICROALGOS: '310000',
};

function realBackfill(spendable = 5_000_000n) {
  const prisma: any = {
    audit_logs: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
    user_chain_wallets: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(async (query: { strings?: string[] }) => {
      const text = (query.strings ?? []).join(' ');
      if (text.includes('users_without_wallet')) {
        return [{ users_without_wallet: 4, with_farm_balance: 4 }];
      }
      return [
        { id: 'u1', farm: 10 },
        { id: 'u2', farm: 0 },
      ];
    }),
  };
  const chain: any = {
    newAccount: jest.fn(),
    funderAddress: jest.fn(() => 'FUNDER'),
    algoInfo: jest
      .fn()
      .mockResolvedValue({ amount: spendable, minBalance: 0n }),
  };
  const svc = new ChainWalletService(prisma, chain, {} as any);
  return {
    controller: new AdminChainController(svc, {} as any),
    chain,
    prisma,
  };
}

describe('wallet backfill handler uses operatorBackfillWallets', () => {
  const old = { ...process.env };
  beforeEach(() => {
    process.env = { ...old, ...ENV };
  });
  afterEach(() => {
    process.env = { ...old };
  });

  it('dry-runs without creating wallets and refuses a bad expectCount or a poor funder', async () => {
    const { controller, chain, prisma } = realBackfill();
    const dry = await controller.backfillWallets(
      ACTOR,
      undefined,
      '4',
      undefined,
      undefined,
      { mode: 'dry' },
    );
    expect(dry).toMatchObject({
      mode: 'dry',
      selected: 2,
      users_without_wallet: 4,
      funder_enough: true,
    });
    expect(chain.newAccount).not.toHaveBeenCalled();
    expect(prisma.audit_logs.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: ACTOR.id,
        action: 'chain.wallet_backfill_dry',
      }),
    });

    await expect(
      controller.backfillWallets(
        ACTOR,
        'send',
        '4',
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow(/expect-count/);
    await expect(
      controller.backfillWallets(ACTOR, undefined, undefined, undefined, '9', {
        mode: 'send',
        limit: 4,
      }),
    ).rejects.toThrow(/does not match/);
    expect(chain.newAccount).not.toHaveBeenCalled();

    const poor = realBackfill(1_000n);
    await expect(
      poor.controller.backfillWallets(
        ACTOR,
        undefined,
        undefined,
        undefined,
        undefined,
        { mode: 'send', limit: 4, expect_count: 2 },
      ),
    ).rejects.toThrow(/too low/);
    expect(poor.chain.newAccount).not.toHaveBeenCalled();
    const audited = JSON.stringify(poor.prisma.audit_logs.create.mock.calls);
    expect(audited).toContain('chain.wallet_backfill_refused');
    expect(audited).not.toMatch(/postgres:\/\/|mnemonic|u1/);
  });
});
