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
    delete process.env.TURNSTILE_SECRET_KEY;
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
});
