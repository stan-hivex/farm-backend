import { createHmac, timingSafeEqual } from 'crypto';

const PREFIX = 'h1:';

/**
 * One-time codes are stored as HMAC-SHA256(secret, code). A plain hash of a
 * 6-digit code is trivially brute-forced, so a server-side secret is required.
 */
export function hashOtp(code: string, secret: string): string {
  if (!secret) throw new Error('OTP hash secret is not configured');
  return (
    PREFIX + createHmac('sha256', secret).update(String(code)).digest('hex')
  );
}

/** Constant-time check; accepts legacy plaintext rows still within expiry. */
export function verifyOtp(
  stored: string,
  code: string,
  secret: string,
): boolean {
  const s = String(stored ?? '');
  const expected = s.startsWith(PREFIX)
    ? hashOtp(code, secret)
    : String(code ?? '');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
