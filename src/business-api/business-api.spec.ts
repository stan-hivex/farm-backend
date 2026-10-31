import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ApiKeysService, generateKey, hashKey } from './api-keys.service';
import { BusinessApiKeyGuard, extractKey } from './api-key-auth.guard';
import { SandboxService } from './sandbox.service';
import { DEFAULT_SCOPES, modeOfKey } from './api-scopes';
import {
  BusinessWebhooksService,
  MAX_ATTEMPTS,
  assertSafeWebhookUrl,
  signPayload,
} from '../business-ops/business-webhooks.service';
import { can } from '../business-ops/permissions';

const actor = (role: string) => ({
  userId: 'u1',
  role,
  business: { id: 'b1', owner_user_id: 'owner' },
});

describe('API key generation', () => {
  it('creates prefixed keys and stores only a sha256 hash', () => {
    const g = generateKey('sandbox');
    expect(g.raw.startsWith('farm_sk_test_')).toBe(true);
    expect(g.hash).toBe(hashKey(g.raw));
    expect(g.hash).not.toContain(g.raw);
    expect(g.raw.startsWith(g.prefix)).toBe(true);
    expect(g.prefix.length).toBeLessThan(g.raw.length);
    expect(modeOfKey(generateKey('live').raw)).toBe('live');
    expect(modeOfKey('sk_other')).toBeNull();
  });

  it('only owner, admin and developer manage keys', () => {
    for (const r of ['owner', 'admin', 'developer'])
      expect(can(r as any, 'developers:manage')).toBe(true);
    for (const r of ['finance', 'accountant', 'operations'])
      expect(can(r as any, 'developers:manage')).toBe(false);
  });
});

describe('ApiKeysService', () => {
  const mk = (role = 'owner', extra: any = {}) => {
    const prisma: any = {
      api_keys: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }) => ({
          id: 'k2',
          created_at: new Date(),
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue({
          id: 'k1',
          status: 'active',
          mode: 'live',
          name: 'n',
          permissions: ['account:read'],
          expires_at: null,
          key_prefix: 'farm_sk_live_abcdef',
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      audit_logs: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
      ...extra,
    };
    const access: any = { resolve: jest.fn().mockResolvedValue(actor(role)) };
    const auth: any = { verifyPin: jest.fn().mockResolvedValue(undefined) };
    return {
      svc: new ApiKeysService(prisma, access, auth),
      prisma,
      access,
      auth,
    };
  };

  it('returns the secret once and persists only hash + prefix', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.create('u1', { name: 'Server', mode: 'sandbox' });
    const saved = prisma.api_keys.create.mock.calls[0][0].data;
    expect(r.data.secret.startsWith('farm_sk_test_')).toBe(true);
    expect(saved.api_key_hash).toBe(hashKey(r.data.secret));
    expect(saved.api_secret).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain(r.data.secret);
    expect(saved.permissions).toEqual(DEFAULT_SCOPES);
    expect(saved.business_id).toBe('b1');
  });

  it('reveal never returns the secret', async () => {
    const { svc } = mk();
    const r: any = await svc.reveal('u1', 'k1');
    expect(r.data).toEqual({
      id: 'k1',
      prefix: 'farm_sk_live_abcdef',
      mode: 'live',
    });
  });

  it('a developer cannot grant money scopes', async () => {
    const { svc } = mk('developer');
    await expect(
      svc.create('u1', { name: 'x', mode: 'live', scopes: ['payouts:write'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.create('u1', { name: 'x', mode: 'live', scopes: ['invoices:write'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rotate and revoke require the PIN', async () => {
    const { svc, auth, prisma } = mk();
    auth.verifyPin.mockRejectedValueOnce(new UnauthorizedException('bad pin'));
    await expect(svc.revoke('u1', 'k1', '0000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.api_keys.update).not.toHaveBeenCalled();
    const r: any = await svc.rotate('u1', 'k1', '1234');
    expect(auth.verifyPin).toHaveBeenLastCalledWith('u1', '1234');
    expect(r.data.rotated_from_id).toBe('k1');
    expect(r.data.secret.startsWith('farm_sk_live_')).toBe(true);
    expect(prisma.api_keys.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'revoked' }),
      }),
    );
  });
});

describe('BusinessApiKeyGuard', () => {
  const raw = generateKey('live').raw;
  const ctx = (headers: any, scope?: string) => {
    const req: any = { headers, method: 'GET', url: '/x' };
    const res: any = { on: jest.fn(), statusCode: 200 };
    const reflector: any = { getAllAndOverride: () => scope };
    return {
      req,
      reflector,
      ec: {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        getHandler: () => null,
        getClass: () => null,
      } as any,
    };
  };
  const prismaWith = (key: any) => ({
    api_keys: {
      findUnique: jest.fn().mockResolvedValue(key),
      update: jest.fn().mockResolvedValue({}),
    },
    business_api_requests: { create: jest.fn().mockResolvedValue({}) },
  });
  const goodKey = {
    id: 'k1',
    status: 'active',
    mode: 'live',
    expires_at: null,
    last_used_at: null,
    permissions: ['invoices:read'],
    business: { id: 'b1', status: 'approved', owner_user_id: 'owner' },
  };

  it('reads Bearer or x-api-key', () => {
    expect(extractKey({ headers: { authorization: 'Bearer abc' } })).toBe(
      'abc',
    );
    expect(extractKey({ headers: { 'x-api-key': 'def' } })).toBe('def');
  });

  it('rejects missing, revoked and mode-mismatched keys', async () => {
    const c = ctx({});
    await expect(
      new BusinessApiKeyGuard(
        c.reflector,
        prismaWith(goodKey) as any,
      ).canActivate(c.ec),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const c2 = ctx({ authorization: `Bearer ${raw}` });
    await expect(
      new BusinessApiKeyGuard(
        c2.reflector,
        prismaWith({ ...goodKey, status: 'revoked' }) as any,
      ).canActivate(c2.ec),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      new BusinessApiKeyGuard(
        c2.reflector,
        prismaWith({ ...goodKey, mode: 'sandbox' }) as any,
      ).canActivate(c2.ec),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('looks up by hash, enforces scope and attaches context', async () => {
    const p = prismaWith(goodKey);
    const c = ctx({ authorization: `Bearer ${raw}` }, 'invoices:read');
    await expect(
      new BusinessApiKeyGuard(c.reflector, p as any).canActivate(c.ec),
    ).resolves.toBe(true);
    expect(p.api_keys.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { api_key_hash: hashKey(raw) } }),
    );
    expect(c.req.farmApi).toMatchObject({
      businessId: 'b1',
      mode: 'live',
      ownerUserId: 'owner',
    });
    const c2 = ctx({ authorization: `Bearer ${raw}` }, 'payouts:write');
    await expect(
      new BusinessApiKeyGuard(
        c2.reflector,
        prismaWith(goodKey) as any,
      ).canActivate(c2.ec),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Webhooks', () => {
  it('signs t.body with HMAC-SHA256', () => {
    const sig = signPayload('whsec_x', 1700000000, '{"a":1}');
    const expected = createHmac('sha256', 'whsec_x')
      .update('1700000000.{"a":1}')
      .digest('hex');
    expect(sig).toBe(`t=1700000000,v1=${expected}`);
  });

  it('refuses non-https and private targets', async () => {
    await expect(assertSafeWebhookUrl('http://example.com')).rejects.toThrow(
      'https',
    );
    await expect(
      assertSafeWebhookUrl('https://127.0.0.1/hook'),
    ).rejects.toThrow('public');
    await expect(assertSafeWebhookUrl('https://10.0.0.5/hook')).rejects.toThrow(
      'public',
    );
    await expect(
      assertSafeWebhookUrl('https://localhost/hook'),
    ).rejects.toThrow('public');
  });

  it('schedules a retry on failure and gives up after the last attempt', async () => {
    const update = jest.fn(async ({ data }) => data);
    const base = {
      id: 'd1',
      status: 'retrying',
      payload: {},
      event_id: 'e',
      event_type: 't',
      endpoint: { is_active: false },
    };
    const prisma: any = {
      business_webhook_deliveries: {
        findUnique: jest.fn().mockResolvedValue({ ...base, attempts: 0 }),
        update,
      },
    };
    const svc = new BusinessWebhooksService(prisma);
    const r1: any = await svc.attempt('d1');
    expect(r1.status).toBe('retrying');
    expect(r1.next_attempt_at).toBeInstanceOf(Date);
    prisma.business_webhook_deliveries.findUnique.mockResolvedValue({
      ...base,
      attempts: MAX_ATTEMPTS - 1,
    });
    const r2: any = await svc.attempt('d1');
    expect(r2.status).toBe('failed');
    expect(r2.next_attempt_at).toBeNull();
  });

  it('only sends to endpoints subscribed to the event and in the same mode', async () => {
    const prisma: any = {
      business_webhook_endpoints: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', events: ['invoice.paid'] },
          { id: 'e2', events: ['payout.requested'] },
          { id: 'e3', events: ['*'] },
        ]),
      },
      business_webhook_deliveries: {
        create: jest.fn(async ({ data }) => ({ id: data.endpoint_id })),
      },
    };
    const svc = new BusinessWebhooksService(prisma);
    jest.spyOn(svc, 'attempt').mockResolvedValue(null);
    const ids = await svc.enqueue('b1', 'sandbox', 'invoice.paid', {});
    expect(ids).toEqual(['e1', 'e3']);
    expect(
      prisma.business_webhook_endpoints.findMany.mock.calls[0][0].where.mode,
    ).toBe('sandbox');
    expect(
      prisma.business_webhook_deliveries.create.mock.calls[0][0].data.payload
        .livemode,
    ).toBe(false);
  });
});

describe('SandboxService', () => {
  it('simulated payments stay in sandbox tables and fire sandbox webhooks', async () => {
    const prisma: any = {
      business_sandbox_objects: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          object_type: 'invoice',
          status: 'sent',
          amount: 50,
          currency: 'USD',
          data: {},
        }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(async ({ data }) => ({ id: 'p1', ...data })),
      },
    };
    const webhooks: any = { emit: jest.fn() };
    const r: any = await new SandboxService(prisma, webhooks).simulatePayment(
      'b1',
      'invoice',
      'i1',
    );
    expect(r.livemode).toBe(false);
    expect(r.data.status).toBe('completed');
    expect(Object.keys(prisma)).toEqual(['business_sandbox_objects']);
    expect(webhooks.emit).toHaveBeenCalledWith(
      'b1',
      'sandbox',
      'invoice.paid',
      expect.anything(),
    );
    expect(
      webhooks.emit.mock.calls.every((c: any[]) => c[1] === 'sandbox'),
    ).toBe(true);
  });
});
