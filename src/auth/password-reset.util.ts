import { randomBytes } from 'crypto';

export class PasswordResetRateLimiter {
  private readonly buckets = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxAttempts = 3,
  ) {}

  allowRequest(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > this.maxAttempts) {
      return false;
    }

    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

export function generatePasswordResetToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
