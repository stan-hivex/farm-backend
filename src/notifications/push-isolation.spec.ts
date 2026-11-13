import { notification_type } from '@prisma/client';
import axios from 'axios';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from './notifications.service';
import {
  AUDITED_PRIVATE_NOTIFICATION_TYPES,
  rebindPushSession,
} from './push-device-registry';

/**
 * In-memory session and push-token store. Exercises the real logout,
 * registration, and dispatch code without a database.
 */
function createStore() {
  let seq = 0;
  const next = (prefix: string) => `${prefix}-${++seq}`;
  const sessions: any[] = [];
  const tokens: any[] = [];
  const notes: any[] = [];
  const activity: any[] = [];

  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, expected]) => {
      if (key === 'OR') {
        return (expected as any[]).some((branch) => matches(row, branch));
      }
      if (key === 'AND') {
        return (expected as any[]).every((branch) => matches(row, branch));
      }
      if (key === 'NOT') return !matches(row, expected);
      if (
        expected &&
        typeof expected === 'object' &&
        !(expected instanceof Date)
      ) {
        const filter = expected as Record<string, unknown>;
        if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
        if ('not' in filter) return row[key] !== filter.not;
        return false;
      }
      return row[key] === expected;
    });
  };

  const project = (row: any, select?: Record<string, boolean>) => {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.keys(select)
        .filter((key) => select[key])
        .map((key) => [key, row[key]]),
    );
  };

  const withSession = (row: any, include?: any) => {
    const copy = { ...row };
    if (include?.session) {
      const session = sessions.find((item) => item.id === row.session_id);
      copy.session = session ? project(session, include.session.select) : null;
    }
    return copy;
  };

  const ordered = (rows: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return rows;
    const [key, direction] = Object.entries(orderBy)[0];
    const sign = direction === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const left = a[key] ? new Date(a[key]).getTime() : 0;
      const right = b[key] ? new Date(b[key]).getTime() : 0;
      return (left - right) * sign;
    });
  };

  const device_tokens = {
    findMany: jest.fn(async ({ where, include, select, orderBy }: any = {}) =>
      ordered(
        tokens.filter((row) => matches(row, where)),
        orderBy,
      ).map((row) =>
        select ? project(row, select) : withSession(row, include),
      ),
    ),
    findFirst: jest.fn(async ({ where }: any = {}) => {
      const row = tokens.find((item) => matches(item, where));
      return row ? { ...row } : null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: next('token'),
        is_active: true,
        revoked_at: null,
        session_id: null,
        created_at: new Date(),
        last_seen: null,
        platform: null,
        ...data,
      };
      tokens.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = tokens.find((item) => item.id === where.id);
      if (!row) throw new Error('token not found');
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of tokens) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }),
  };

  const user_sessions = {
    findMany: jest.fn(async ({ where, select, orderBy }: any = {}) =>
      ordered(
        sessions.filter((row) => matches(row, where)),
        orderBy,
      ).map((row) => project(row, select)),
    ),
    findFirst: jest.fn(async ({ where }: any = {}) => {
      const row = sessions.find((item) => matches(item, where));
      return row ? { ...row } : null;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const row = sessions.find((item) => item.id === where.id);
      return row ? { ...row } : null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: next('session'),
        is_revoked: false,
        expires_at: null,
        created_at: new Date(),
        ...data,
      };
      sessions.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = sessions.find((item) => item.id === where.id);
      if (!row) throw new Error('session not found');
      Object.assign(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of sessions) {
        if (!matches(row, where)) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }),
  };

  const db = {
    sessions,
    tokens,
    notes,
    user_sessions,
    device_tokens,
    notifications: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: next('note'), ...data };
        notes.push(row);
        return row;
      }),
    },
    activity_logs: {
      create: jest.fn(async ({ data }: any) => {
        activity.push(data);
        return data;
      }),
    },
    openSession(
      userId: string,
      jti: string,
      extra: Record<string, unknown> = {},
    ) {
      const row = {
        id: next('session'),
        user_id: userId,
        jwt_id: jti,
        is_revoked: false,
        expires_at: null,
        created_at: new Date(),
        last_active_at: null,
        used_at: null,
        device_name: extra.device_name ?? 'Phone',
        device_os: extra.device_os ?? 'android',
        ip_address: extra.ip_address ?? '203.0.113.10',
        user_agent: extra.user_agent ?? 'FARM/1',
        ...extra,
      };
      sessions.push(row);
      return row;
    },
  };
  return db;
}

function harness() {
  const db = createStore();
  const sendEachForMulticast = jest.fn().mockResolvedValue({
    responses: [{ success: true }],
    successCount: 1,
    failureCount: 0,
  });
  const notifications = new NotificationsService(
    db as any,
    { get: () => undefined } as any,
    { messaging: { sendEachForMulticast } } as any,
  );
  const auth = new AuthService(
    db as any,
    {} as any,
    { get: () => undefined } as any,
    notifications,
    {} as any,
    {} as any,
    {} as any,
  );
  const sentTokens = () =>
    sendEachForMulticast.mock.calls.map((call) => call[0].tokens as string[]);
  return { db, auth, notifications, sendEachForMulticast, sentTokens };
}

async function register(
  auth: AuthService,
  userId: string,
  jti: string,
  token: string,
  platform = 'android',
) {
  return auth.registerDeviceToken(userId, token, platform, jti);
}

describe('push notification account isolation', () => {
  it('covers every private notification type the schema can store', () => {
    expect(Object.values(notification_type).sort()).toEqual(
      [...AUDITED_PRIVATE_NOTIFICATION_TYPES].sort(),
    );
  });

  it('TEST A: logout stops a later payment request from reaching that phone', async () => {
    const { db, auth, notifications, sendEachForMulticast } = harness();
    db.openSession('account-a', 'jti-a', {
      device_name: 'Borrowed phone',
      ip_address: '198.51.100.8',
    });
    await register(auth, 'account-a', 'jti-a', 'fcm-phone-1');

    await auth.logout('account-a', 'jti-a');
    sendEachForMulticast.mockClear();

    const note = await notifications.sendNotification('account-a', {
      type: 'payment_request',
      title: 'Payment request',
      body: 'mkulima requested 100 FARM from you',
      entityId: 'req-100',
    });

    expect(note.user_id).toBe('account-a');
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(db.tokens[0]).toMatchObject({
      user_id: 'account-a',
      is_active: false,
    });
    expect(db.sessions[0].is_revoked).toBe(true);
  });

  it('TEST B: the same phone receives only the account that currently owns the token', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    db.openSession('account-a', 'jti-a');
    db.openSession('account-b', 'jti-b', {
      device_name: 'Shared phone',
      ip_address: '198.51.100.20',
    });
    await register(auth, 'account-a', 'jti-a', 'fcm-shared-phone');
    await auth.logout('account-a', 'jti-a');
    await register(auth, 'account-b', 'jti-b', 'fcm-shared-phone');

    await notifications.sendNotification('account-a', {
      type: 'payment_request',
      title: 'Payment request',
      body: 'mkulima requested 100 FARM from you',
    });
    await notifications.sendNotification('account-b', {
      type: 'payment_request',
      title: 'Payment request',
      body: 'gracie requested 50 FARM from you',
    });

    expect(sentTokens()).toEqual([['fcm-shared-phone']]);
    expect(db.tokens).toHaveLength(1);
    expect(db.tokens[0].user_id).toBe('account-b');
  });

  it('moves a token to the next account even when the previous account does not log out first', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    const phone2 = db.openSession('account-a', 'jti-a-phone-2', {
      device_name: 'Personal phone',
    });
    db.openSession('account-a', 'jti-a-shared');
    db.openSession('account-b', 'jti-b');
    await register(auth, 'account-a', 'jti-a-shared', 'fcm-shared-phone');
    await register(auth, 'account-a', 'jti-a-phone-2', 'fcm-personal-phone');
    await register(auth, 'account-b', 'jti-b', 'fcm-shared-phone');

    await notifications.sendNotification('account-a', {
      type: 'transfer_received',
      title: 'Money received',
      body: 'You received 10 FARM',
    });
    await notifications.sendNotification('account-b', {
      type: 'merchant_payment',
      title: 'Merchant payment',
      body: 'You paid 10 FARM',
    });

    expect(sentTokens()).toEqual([
      ['fcm-personal-phone'],
      ['fcm-shared-phone'],
    ]);
    expect(
      db.tokens.find((row) => row.token === 'fcm-shared-phone'),
    ).toMatchObject({
      user_id: 'account-b',
      session_id: expect.any(String),
    });
    expect(phone2.is_revoked).toBe(false);
  });

  it('TEST C: logging out one phone leaves the other phone registered', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    db.openSession('account-a', 'jti-phone-1', {
      device_name: 'Phone 1',
      ip_address: '203.0.113.1',
    });
    db.openSession('account-a', 'jti-phone-2', {
      device_name: 'Phone 2',
      ip_address: '203.0.113.2',
    });
    await register(auth, 'account-a', 'jti-phone-1', 'fcm-phone-1');
    await register(auth, 'account-a', 'jti-phone-2', 'fcm-phone-2');

    await auth.logout('account-a', 'jti-phone-1');
    await notifications.sendNotification('account-a', {
      type: 'deposit_completed',
      title: 'Deposit completed',
      body: 'Your deposit of 100 FARM arrived',
    });

    expect(sentTokens()).toEqual([['fcm-phone-2']]);
    expect(
      db.sessions.find((row) => row.jwt_id === 'jti-phone-2').is_revoked,
    ).toBe(false);
  });

  it('TEST D: a remotely revoked session stops receiving pushes', async () => {
    const { db, auth, notifications, sendEachForMulticast } = harness();
    const session = db.openSession('account-a', 'jti-a', {
      device_name: 'Lost phone',
      ip_address: '198.51.100.44',
    });
    db.openSession('account-a', 'jti-keeper', { device_name: 'Keeper' });
    await register(auth, 'account-a', 'jti-a', 'fcm-lost');
    await register(auth, 'account-a', 'jti-keeper', 'fcm-keeper');

    await auth.revokeSession('account-a', session.id);
    sendEachForMulticast.mockClear();
    await notifications.sendNotification('account-a', {
      type: 'security',
      title: 'New login',
      body: 'Your account was used on a new device',
    });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual([
      'fcm-keeper',
    ]);
    expect(db.sessions.find((row) => row.id === session.id).is_revoked).toBe(
      true,
    );
  });

  it('logs out every other device and keeps the current phone', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    db.openSession('account-a', 'jti-current', { device_name: 'This phone' });
    db.openSession('account-a', 'jti-other', { device_name: 'Other phone' });
    await register(auth, 'account-a', 'jti-current', 'fcm-current');
    await register(auth, 'account-a', 'jti-other', 'fcm-other');

    await auth.revokeOtherSessions('account-a', 'jti-current');
    await notifications.sendPush(
      'account-a',
      'Security alert',
      'Other devices were signed out',
      { type: 'security' },
    );

    expect(sentTokens()).toEqual([['fcm-current']]);
    const listed = await auth.getSessions('account-a', 'jti-current');
    const current = listed.sessions.find((row) => row.is_current);
    const other = listed.sessions.find(
      (row) => row.device_name === 'Other phone',
    );
    expect(current).toMatchObject({
      push_registered: true,
      is_revoked: false,
      ip_address: '203.0.113.10',
    });
    expect(other).toMatchObject({ is_revoked: true, push_registered: false });
    expect(JSON.stringify(listed)).not.toContain('fcm-current');
  });

  it('does not remove the next account when logout includes the shared token', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    db.openSession('account-a', 'jti-a');
    db.openSession('account-b', 'jti-b');
    await register(auth, 'account-a', 'jti-a', 'fcm-shared-phone');
    await register(auth, 'account-b', 'jti-b', 'fcm-shared-phone');

    await auth.logout('account-a', 'jti-a', false, 'fcm-shared-phone');
    await notifications.sendNotification('account-b', {
      type: 'withdrawal_completed',
      title: 'Withdrawal completed',
      body: '50 FARM was withdrawn',
    });
    await notifications.sendNotification('account-a', {
      type: 'withdrawal_completed',
      title: 'Withdrawal completed',
      body: '50 FARM was withdrawn',
    });

    expect(sentTokens()).toEqual([['fcm-shared-phone']]);
    expect(db.tokens[0]).toMatchObject({
      user_id: 'account-b',
      is_active: true,
      revoked_at: null,
    });
  });

  it('replaces a refreshed push token and follows session refresh onto the new session', async () => {
    const { db, auth, notifications, sentTokens } = harness();
    const original = db.openSession('account-a', 'jti-old');
    await register(auth, 'account-a', 'jti-old', 'fcm-old');
    await register(auth, 'account-a', 'jti-old', 'fcm-rotated');

    const rotated = await db.user_sessions.create({
      data: {
        user_id: 'account-a',
        jwt_id: 'jti-new',
        is_revoked: false,
        expires_at: null,
      },
    });
    original.is_revoked = true;
    await rebindPushSession(db, 'account-a', original.id, rotated.id);

    await notifications.sendNotification('account-a', {
      type: 'transaction',
      title: 'Transaction confirmed',
      body: 'You sent 5 FARM',
    });

    expect(sentTokens()).toEqual([['fcm-rotated']]);
    expect(db.tokens.find((row) => row.token === 'fcm-old').is_active).toBe(
      false,
    );
    expect(
      db.tokens.find((row) => row.token === 'fcm-rotated').session_id,
    ).toBe(rotated.id);
  });

  it('drops an expired session and a token left over from reinstall', async () => {
    const { db, auth, notifications, sendEachForMulticast } = harness();
    const expired = db.openSession('account-a', 'jti-expired', {
      expires_at: new Date(Date.now() - 60_000),
    });
    const reinstalled = db.openSession('account-a', 'jti-new');
    await db.device_tokens.create({
      data: {
        user_id: 'account-a',
        token: 'fcm-expired',
        session_id: expired.id,
        is_active: true,
        revoked_at: null,
        platform: 'ios',
      },
    });
    await register(auth, 'account-a', 'jti-new', 'fcm-reinstalled');

    await notifications.sendPush('account-a', 'Transfer', 'Sent 1 FARM', {
      type: 'transfer_sent',
      tokens: ['fcm-expired', 'stale-queued-token'],
    });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual([
      'fcm-reinstalled',
    ]);
    expect(reinstalled.is_revoked).toBe(false);
  });

  it('does not deliver a queued retry after logout', async () => {
    const { db, auth, notifications, sendEachForMulticast } = harness();
    db.openSession('account-a', 'jti-a');
    await register(auth, 'account-a', 'jti-a', 'fcm-phone-1');
    await notifications.sendNotification('account-a', {
      type: 'escrow_created',
      title: 'Escrow',
      body: 'Escrow opened',
    });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);

    await auth.logout('account-a', 'jti-a');
    sendEachForMulticast.mockClear();
    await notifications.sendNotification('account-a', {
      type: 'escrow_released',
      title: 'Escrow released',
      body: 'Escrow released',
    });
    await notifications.sendPush(
      'account-a',
      'Your FARM OTP',
      'Your FARM OTP is 123456',
      {
        otp_code: '123456',
        purpose: 'phone_verification',
      },
    );

    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(db.notes.map((note) => note.type)).toEqual([
      'escrow_created',
      'escrow_released',
    ]);
  });

  it('refuses a legacy token that is not bound to a session', async () => {
    const { db, notifications, sendEachForMulticast } = harness();
    db.openSession('account-a', 'jti-a');
    await db.device_tokens.create({
      data: {
        user_id: 'account-a',
        token: 'fcm-legacy',
        session_id: null,
        is_active: true,
        revoked_at: null,
      },
    });
    await notifications.sendNotification('account-a', {
      type: 'kyc_update',
      title: 'KYC update',
      body: 'Your documents were approved',
    });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it.each(AUDITED_PRIVATE_NOTIFICATION_TYPES)(
    'audits %s so a logged-out device is excluded and the signed-in device is included',
    async (type) => {
      const { db, auth, notifications, sendEachForMulticast } = harness();
      db.openSession('account-a', 'jti-out');
      db.openSession('account-a', 'jti-in');
      await register(auth, 'account-a', 'jti-out', `fcm-out-${type}`);
      await register(auth, 'account-a', 'jti-in', `fcm-in-${type}`);
      await auth.logout('account-a', 'jti-out');
      sendEachForMulticast.mockClear();

      await notifications.sendNotification('account-a', {
        type,
        title: type,
        body: `${type} for account A`,
      });

      expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
      expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual([
        `fcm-in-${type}`,
      ]);
      const serialized = JSON.stringify(sendEachForMulticast.mock.calls);
      expect(serialized).not.toContain(`fcm-out-${type}`);
    },
  );

  it('sends password-reset email without reading device tokens', async () => {
    const { db } = harness();
    const service = new NotificationsService(
      db as any,
      {
        get: (key: string) =>
          ({
            RESEND_API_KEY: 'test-resend-key',
            RESEND_FROM: 'FARM <support@farmapp.africa>',
          })[key],
      } as any,
      { messaging: { sendEachForMulticast: jest.fn() } } as any,
    );
    const post = jest.spyOn(axios, 'post').mockResolvedValue({});
    db.device_tokens.findMany.mockClear();

    await service.sendEmailOrThrow(
      'person@example.com',
      'Reset your FARM password',
      '<p>Reset</p>',
      'Reset your password',
    );

    expect(db.device_tokens.findMany).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('lists devices with session metadata and without the push token', async () => {
    const { db, auth } = harness();
    db.openSession('account-a', 'jti-a', {
      device_name: 'Pixel',
      device_os: 'android',
      ip_address: '192.0.2.15',
      user_agent: 'FARM Android',
    });
    await register(auth, 'account-a', 'jti-a', 'fcm-secret-token', 'android');

    const listed = await auth.listPushDevices('account-a', 'jti-a');

    expect(listed.devices).toEqual([
      expect.objectContaining({
        platform: 'android',
        is_active: true,
        session: expect.objectContaining({
          device_name: 'Pixel',
          device_os: 'android',
          ip_address: '192.0.2.15',
          user_agent: 'FARM Android',
          is_current: true,
          is_revoked: false,
        }),
      }),
    ]);
    expect(JSON.stringify(listed)).not.toContain('fcm-secret-token');
  });
});
