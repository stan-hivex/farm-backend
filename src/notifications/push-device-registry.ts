import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Push delivery authorization.
 *
 * A device token is a routing address, not a credential. It receives an
 * account's private notifications only when the row is active, not revoked,
 * owned by that account, and bound to one of that account's unexpired,
 * unrevoked sessions. Logout, remote revocation, expiry, and account
 * switching all remove that binding. Callers must re-read eligibility
 * immediately before FCM/APNs send; a token captured earlier is stale.
 */

const PUSH_TOKEN_MAX = 4096;

export const AUDITED_PRIVATE_NOTIFICATION_TYPES = [
  'system',
  'admin',
  'transaction',
  'transfer_received',
  'transfer_sent',
  'payment_request',
  'request_completed',
  'request_declined',
  'request_expired',
  'deposit_completed',
  'withdrawal_completed',
  'merchant_payment',
  'system_announcement',
  'kyc_update',
  'security',
  'escrow',
  'escrow_created',
  'escrow_received',
  'escrow_disputed',
  'escrow_released',
  'escrow_refunded',
  'investment',
  'merchant',
  'transfer_request',
] as const;

type SessionLike = {
  id?: string;
  user_id?: string | null;
  is_revoked?: boolean | null;
  expires_at?: Date | string | null;
};

type TokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform?: string | null;
  is_active?: boolean | null;
  revoked_at?: Date | null;
  session_id?: string | null;
  session?: SessionLike | null;
};

type RegistryDb = {
  user_sessions: {
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
  };
  device_tokens: {
    findFirst: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
};

export function isSessionActive(
  session: SessionLike | null | undefined,
  userId: string,
  now = new Date(),
): boolean {
  if (!session || session.user_id !== userId) return false;
  if (session.is_revoked === true) return false;
  if (session.expires_at) {
    const expires = new Date(session.expires_at).getTime();
    if (!Number.isNaN(expires) && expires <= now.getTime()) return false;
  }
  return true;
}

/** Reads an optional push token from a logout body. Never logs the value. */
export function readPushToken(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  for (const key of [
    'token',
    'device_token',
    'deviceToken',
    'fcm_token',
    'push_token',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizePushToken(token: string): string {
  const normalized = token?.trim() ?? '';
  if (!normalized) {
    throw new BadRequestException('Device token is required');
  }
  if (normalized.length > PUSH_TOKEN_MAX) {
    throw new BadRequestException('Device token is too long');
  }
  return normalized;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

async function findActiveSession(
  db: RegistryDb,
  userId: string,
  sessionJti: string | undefined,
) {
  if (!sessionJti) {
    throw new UnauthorizedException(
      'An active session is required to register this device',
    );
  }
  const session = await db.user_sessions.findFirst({
    where: {
      user_id: userId,
      jwt_id: sessionJti,
      OR: [{ is_revoked: false }, { is_revoked: null }],
    },
  });
  if (!session || !isSessionActive(session, userId)) {
    throw new UnauthorizedException('Session is not active');
  }
  return session;
}

async function retireSiblingTokens(
  db: RegistryDb,
  userId: string,
  sessionId: string,
  keepId: string,
) {
  await db.device_tokens.updateMany({
    where: {
      user_id: userId,
      session_id: sessionId,
      is_active: true,
      NOT: { id: keepId },
    },
    data: { is_active: false, revoked_at: new Date() },
  });
}

/**
 * Binds a push token to the caller's current session.
 * The same token previously registered to another account or session is
 * moved, so the previous account can no longer be notified on this device.
 * A rotated FCM/APNs token replaces older tokens on this session.
 */
export async function claimPushDevice(
  db: RegistryDb,
  input: {
    userId: string;
    token: string;
    platform?: string;
    sessionJti?: string;
  },
) {
  const token = normalizePushToken(input.token);
  const session = await findActiveSession(db, input.userId, input.sessionJti);
  const now = new Date();

  const assign = async (existingId: string, platform?: string | null) => {
    await db.device_tokens.update({
      where: { id: existingId },
      data: {
        user_id: input.userId,
        session_id: session.id,
        platform: input.platform || platform || 'unknown',
        is_active: true,
        revoked_at: null,
        last_seen: now,
      },
    });
    await retireSiblingTokens(db, input.userId, session.id, existingId);
  };

  const existing = await db.device_tokens.findFirst({ where: { token } });
  if (existing) {
    const sameOwner = existing.user_id === input.userId;
    await assign(existing.id, existing.platform);
    return {
      message: sameOwner ? 'Device token updated' : 'Device token registered',
    };
  }

  try {
    const created = await db.device_tokens.create({
      data: {
        user_id: input.userId,
        token,
        session_id: session.id,
        platform: input.platform || 'unknown',
        is_active: true,
        revoked_at: null,
        last_seen: now,
      },
    });
    await retireSiblingTokens(db, input.userId, session.id, created.id);
    return { message: 'Device token registered' };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const raced = await db.device_tokens.findFirst({ where: { token } });
    if (!raced) throw error;
    await assign(raced.id, raced.platform);
    return { message: 'Device token registered' };
  }
}

/** Stops pushes for the given sessions of this account only. */
export async function revokePushDevices(
  db: Pick<RegistryDb, 'device_tokens'>,
  input: { userId: string; sessionIds?: string[]; all?: boolean },
) {
  const now = new Date();
  if (input.all) {
    return db.device_tokens.updateMany({
      where: { user_id: input.userId, is_active: true },
      data: { is_active: false, revoked_at: now },
    });
  }
  const sessionIds = (input.sessionIds ?? []).filter(Boolean);
  if (sessionIds.length === 0) return { count: 0 };
  return db.device_tokens.updateMany({
    where: {
      user_id: input.userId,
      session_id: { in: sessionIds },
      is_active: true,
    },
    data: { is_active: false, revoked_at: now },
  });
}

/**
 * Revokes a token only while this account still owns it. A token already
 * claimed by the next account on the same phone is left alone.
 */
export async function revokeOwnedPushToken(
  db: Pick<RegistryDb, 'device_tokens'>,
  userId: string,
  rawToken: string,
) {
  const token = rawToken?.trim();
  if (!token || token.length > PUSH_TOKEN_MAX) return { count: 0 };
  return db.device_tokens.updateMany({
    where: { user_id: userId, token, is_active: true },
    data: { is_active: false, revoked_at: new Date() },
  });
}

/** Keeps pushes working across refresh-token rotation for the same device. */
export async function rebindPushSession(
  db: Pick<RegistryDb, 'device_tokens'>,
  userId: string,
  fromSessionId: string | undefined,
  toSessionId: string | undefined,
) {
  if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return;
  await db.device_tokens.updateMany({
    where: {
      user_id: userId,
      session_id: fromSessionId,
      is_active: true,
      revoked_at: null,
    },
    data: { session_id: toSessionId, last_seen: new Date() },
  });
}

/** Moves this trusted device's active registrations onto its newest session. */
export async function rebindTrustedDevicePushes(
  db: RegistryDb,
  userId: string,
  trustedDeviceId: string | undefined,
  toSessionId: string | undefined,
) {
  if (!trustedDeviceId || !toSessionId) return;
  const sessions = await db.user_sessions.findMany({
    where: { user_id: userId, trusted_device_id: trustedDeviceId },
    select: { id: true },
  });
  const fromIds = sessions
    .map((session) => session.id as string)
    .filter((id) => id && id !== toSessionId);
  if (fromIds.length === 0) return;
  await db.device_tokens.updateMany({
    where: {
      user_id: userId,
      session_id: { in: fromIds },
      is_active: true,
      revoked_at: null,
    },
    data: { session_id: toSessionId, last_seen: new Date() },
  });
}

/**
 * Tokens that may be used for the next send. Re-reads ownership and session
 * state so a queued or retried job cannot deliver to a logged-out device.
 */
export async function listEligiblePushTokens(
  db: Pick<RegistryDb, 'device_tokens'>,
  userId: string,
  now = new Date(),
): Promise<string[]> {
  const rows = (await db.device_tokens.findMany({
    where: {
      user_id: userId,
      is_active: true,
      revoked_at: null,
      session_id: { not: null },
    },
    include: {
      session: {
        select: {
          id: true,
          user_id: true,
          is_revoked: true,
          expires_at: true,
        },
      },
    },
  })) as TokenRow[];

  const tokens: string[] = [];
  for (const row of rows) {
    if (row.user_id !== userId) continue;
    if (row.is_active === false || row.revoked_at) continue;
    if (!row.token || !isSessionActive(row.session, userId, now)) continue;
    tokens.push(row.token);
  }
  return tokens;
}
