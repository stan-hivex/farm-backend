import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

type Mock = jest.Mock;

function build(
  opts: { emailConfigured?: boolean; cfg?: Record<string, string> } = {},
) {
  const cfgValues: Record<string, string> = {
    BCRYPT_ROUNDS: '4',
    APP_URL: 'https://app.example',
    ...(opts.cfg ?? {}),
  };
  const tx = {
    users: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user_sessions: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    activity_logs: { create: jest.fn() },
    email_verification_tokens: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    users: { findUnique: jest.fn(), findFirst: jest.fn() },
    email_verification_tokens: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockReturnValue('UPDATE_OP'),
      create: jest.fn().mockReturnValue('CREATE_OP'),
    },
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => Promise<unknown>)(tx)
        : Promise.resolve(arg),
    ),
  };
  const notifications = {
    isTransactionalEmailConfigured: jest
      .fn()
      .mockReturnValue(opts.emailConfigured ?? true),
    sendEmailOrThrow: jest.fn().mockResolvedValue(undefined),
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };
  const cfg = { get: jest.fn((k: string) => cfgValues[k]) };
  const svc = new AuthService(
    prisma as never,
    {} as never,
    cfg as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, prisma, tx, notifications };
}

describe('AuthService.changePassword', () => {
  const strong = 'NewPassw0rd!xyz';

  it('rejects a wrong current password and changes nothing', async () => {
    const { svc, prisma, tx } = build();
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      password_hash: await bcrypt.hash('OldPassw0rd!abc', 4),
    });
    await expect(
      svc.changePassword(
        'u1',
        {
          current_password: 'wrong',
          new_password: strong,
          confirm_password: strong,
        },
        'j1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation and reuse of the current password', async () => {
    const { svc } = build();
    await expect(
      svc.changePassword('u1', {
        current_password: 'a',
        new_password: strong,
        confirm_password: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.changePassword('u1', {
        current_password: strong,
        new_password: strong,
        confirm_password: strong,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hashes the new password, revokes other sessions, keeps this one and notifies', async () => {
    const { svc, prisma, tx, notifications } = build();
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      password_hash: await bcrypt.hash('OldPassw0rd!abc', 4),
    });
    const res = await svc.changePassword(
      'u1',
      {
        current_password: 'OldPassw0rd!abc',
        new_password: strong,
        confirm_password: strong,
      },
      'current-jti',
    );
    expect(res.message).toMatch(/changed/);
    const data = (tx.users.update as Mock).mock.calls[0][0].data as {
      password_hash: string;
    };
    expect(await bcrypt.compare(strong, data.password_hash)).toBe(true);
    const where = (tx.user_sessions.updateMany as Mock).mock.calls[0][0].where;
    expect(where).toMatchObject({
      user_id: 'u1',
      NOT: { jwt_id: 'current-jti' },
    });
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: 'security' }),
    );
  });
});

describe('AuthService email verification', () => {
  it('fails clearly when no email provider is configured', async () => {
    const { svc, prisma } = build({ emailConfigured: false });
    await expect(svc.resendEmailVerification('a@b.co')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.users.findFirst).not.toHaveBeenCalled();
  });

  it('stores only a hash, invalidates older links and emails the raw token', async () => {
    const { svc, prisma, notifications } = build();
    prisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      email_verified: false,
    });
    await svc.resendEmailVerification('A@B.co');
    const created = (prisma.email_verification_tokens.create as Mock).mock
      .calls[0][0].data;
    const text = (notifications.sendEmailOrThrow as Mock).mock
      .calls[0][3] as string;
    const token = /token=([a-f0-9]{64})/.exec(text)![1];
    expect(created.token_hash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(created.token_hash).not.toBe(token);
    expect(created.expires_at.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3600e3,
    );
    expect(prisma.email_verification_tokens.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', used_at: null },
      data: expect.any(Object),
    });
  });

  it('does not reveal unknown or already-verified accounts', async () => {
    const { svc, prisma, notifications } = build();
    prisma.users.findFirst.mockResolvedValue(null);
    await expect(svc.resendEmailVerification('x@y.co')).resolves.toHaveProperty(
      'message',
    );
    expect(notifications.sendEmailOrThrow).not.toHaveBeenCalled();
  });

  it('rate-limits resends (cooldown and daily cap)', async () => {
    const { svc, prisma } = build();
    prisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.co',
      email_verified: false,
    });
    prisma.email_verification_tokens.findMany.mockResolvedValue([
      { created_at: new Date() },
    ]);
    await expect(svc.resendEmailVerification('a@b.co')).rejects.toBeInstanceOf(
      HttpException,
    );
    prisma.email_verification_tokens.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({
        created_at: new Date(Date.now() - 3600e3),
      })),
    );
    await expect(svc.resendEmailVerification('a@b.co')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('verifies with a valid token exactly once', async () => {
    const { svc, prisma, tx } = build();
    const token = 'a'.repeat(64);
    prisma.email_verification_tokens.findUnique.mockResolvedValue({
      id: 't1',
      user_id: 'u1',
      email: 'a@b.co',
      used_at: null,
      expires_at: new Date(Date.now() + 1000),
    });
    await expect(svc.verifyEmail(token)).resolves.toEqual({
      message: 'Email verified successfully',
    });
    expect(tx.users.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', email: 'a@b.co' },
      data: { email_verified: true },
    });
    tx.email_verification_tokens.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.verifyEmail(token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects expired, used, malformed and unknown tokens', async () => {
    const { svc, prisma } = build();
    await expect(svc.verifyEmail('nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.email_verification_tokens.findUnique.mockResolvedValue(null);
    await expect(svc.verifyEmail('b'.repeat(64))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.email_verification_tokens.findUnique.mockResolvedValue({
      id: 't',
      user_id: 'u',
      email: 'e',
      used_at: null,
      expires_at: new Date(Date.now() - 1),
    });
    await expect(svc.verifyEmail('b'.repeat(64))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.email_verification_tokens.findUnique.mockResolvedValue({
      id: 't',
      user_id: 'u',
      email: 'e',
      used_at: new Date(),
      expires_at: new Date(Date.now() + 1e6),
    });
    await expect(svc.verifyEmail('b'.repeat(64))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
