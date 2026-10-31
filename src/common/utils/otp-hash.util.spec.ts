import { hashOtp, verifyOtp } from './otp-hash.util';

describe('otp hashing', () => {
  it('never stores the code itself and verifies it', () => {
    const h = hashOtp('123456', 's3cret');
    expect(h).not.toContain('123456');
    expect(h).toMatch(/^h1:[0-9a-f]{64}$/);
    expect(verifyOtp(h, '123456', 's3cret')).toBe(true);
    expect(verifyOtp(h, '123457', 's3cret')).toBe(false);
    expect(verifyOtp(h, '123456', 'other')).toBe(false);
  });
  it('accepts legacy plaintext rows', () => {
    expect(verifyOtp('654321', '654321', 'x')).toBe(true);
    expect(verifyOtp('654321', '000000', 'x')).toBe(false);
  });
  it('requires a secret', () => {
    expect(() => hashOtp('1', '')).toThrow();
  });
});
