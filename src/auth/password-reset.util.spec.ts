import { PasswordResetRateLimiter, generatePasswordResetToken } from './password-reset.util';

describe('password reset utilities', () => {
  it('generates a secure reset token', () => {
    const token = generatePasswordResetToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('blocks requests once the rate limit is exceeded', () => {
    const limiter = new PasswordResetRateLimiter(60_000, 2);
    const key = 'user@example.com';
    const now = 1_700_000_000_000;

    expect(limiter.allowRequest(key, now)).toBe(true);
    expect(limiter.allowRequest(key, now)).toBe(true);
    expect(limiter.allowRequest(key, now + 1)).toBe(false);
  });
});
