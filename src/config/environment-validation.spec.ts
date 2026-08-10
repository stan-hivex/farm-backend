import { validateSecurityEnvironment } from './environment-validation';

describe('validateSecurityEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.QR_HMAC_SECRET;
    delete process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws in production when required secrets are missing', () => {
    expect(() => validateSecurityEnvironment()).toThrow(/Production security validation failed/);
    expect(process.env.QR_HMAC_SECRET).toBeUndefined();
    expect(process.env.FIELD_ENCRYPTION_KEY).toBeUndefined();
    expect(process.env.JWT_ACCESS_SECRET).toBeUndefined();
    expect(process.env.JWT_REFRESH_SECRET).toBeUndefined();
  });

  it('does not throw when REDIS_HOST and REDIS_PORT are set instead of REDIS_URL', () => {
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.QR_HMAC_SECRET = 'c'.repeat(32);
    process.env.FIELD_ENCRYPTION_KEY = 'd'.repeat(32);
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.REDIS_HOST = 'redis.internal';
    process.env.REDIS_PORT = '6380';

    expect(() => validateSecurityEnvironment()).not.toThrow();
  });
});
