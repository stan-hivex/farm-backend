import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy session gate', () => {
  const req = {
    ip: '203.0.113.8',
    headers: {
      authorization: 'Bearer super-secret-jwt',
      'user-agent': 'FARM/1',
    },
  } as any;

  function build(session: any) {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'user',
          is_active: true,
          is_suspended: false,
          is_deleted: false,
        }),
      },
      user_sessions: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue({}),
      },
      security_events: { create: jest.fn().mockResolvedValue({}) },
    };
    const cfg = {
      get: (key: string) =>
        key === 'JWT_ACCESS_SECRET' ? 'a'.repeat(40) : undefined,
    };
    const strategy = new JwtStrategy(cfg as any, prisma as any);
    return { strategy, prisma };
  }

  it('rejects a revoked session without logging the bearer token', async () => {
    const { strategy, prisma } = build(null);
    await expect(
      strategy.validate(req, { sub: 'user-1', role: 'user', jti: 'jti-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const description = prisma.security_events.create.mock.calls[0][0].data
      .description as string;
    expect(description).not.toContain('super-secret-jwt');
    expect(description).not.toContain('Bearer');
    expect(description).not.toContain('jti-1');
  });

  it('rejects an expired session immediately', async () => {
    const { strategy } = build({
      id: 's1',
      user_id: 'user-1',
      is_revoked: false,
      expires_at: new Date(Date.now() - 1000),
      last_active_at: null,
    });
    await expect(
      strategy.validate(req, { sub: 'user-1', role: 'user', jti: 'jti-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a live session and records last activity', async () => {
    const { strategy, prisma } = build({
      id: 's1',
      user_id: 'user-1',
      is_revoked: false,
      expires_at: new Date(Date.now() + 60_000),
      last_active_at: null,
    });
    await expect(
      strategy.validate(req, {
        sub: 'user-1',
        role: 'user',
        jti: 'jti-1',
        wallet_id: 'w1',
      }),
    ).resolves.toMatchObject({ id: 'user-1', jti: 'jti-1', wallet_id: 'w1' });
    expect(prisma.user_sessions.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { last_active_at: expect.any(Date) },
    });
  });
});
