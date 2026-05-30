
import * as jwt from 'jsonwebtoken';

// JWT-based device tokens with key rotation support.
// Expects `DEVICE_TOKEN_KEYS` environment variable containing a JSON object of { kid: secret }.
// Example: DEVICE_TOKEN_KEYS='{"k1":"secret1","k2":"secret2"}'

function loadKeyRing() {
  const env = process.env.DEVICE_TOKEN_KEYS;
  if (env) {
    try { return JSON.parse(env); } catch { return null; }
  }
  const secret = process.env.DEVICE_TOKEN_SECRET;
  if (secret) return { current: secret } as any;
  return null;
}

export function createDeviceToken(payload: Record<string, any>, opts?: { expiresInSec?: number; kid?: string }) {
  const keys = loadKeyRing();
  if (!keys) throw new Error('No device token signing key available');
  const kid = opts?.kid || Object.keys(keys)[0];
  const secret = (keys as any)[kid] || (keys as any)['current'] || (keys as any)[Object.keys(keys)[0]];
  if (!secret) throw new Error('No device token signing key available');
  const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: opts?.expiresInSec ?? 60 * 60 * 24, header: { kid } } as any);
  return token;
}

export function verifyDeviceToken(token: string) {
  if (!token) return null;
  const keys = loadKeyRing();
  if (!keys) return null;
  try {
    const decodedHeader = jwt.decode(token, { complete: true })?.header as any;
    const kid = decodedHeader?.kid;
    if (kid && (keys as any)[kid]) {
      const secret = (keys as any)[kid];
      return jwt.verify(token, secret, { algorithms: ['HS256'] });
    }
    // If no kid provided, try all keys until one verifies
    for (const k of Object.keys(keys)) {
      try {
        const secret = (keys as any)[k];
        return jwt.verify(token, secret, { algorithms: ['HS256'] });
      } catch (err) {
        // continue
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}
