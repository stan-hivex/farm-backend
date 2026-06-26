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

  it('generates fallback secrets in production instead of exiting when values are missing', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit should not be called');
    }) as never);

    expect(() => validateSecurityEnvironment()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.env.QR_HMAC_SECRET).toBeDefined();
    expect(process.env.FIELD_ENCRYPTION_KEY).toBeDefined();
    expect(process.env.JWT_ACCESS_SECRET).toBeDefined();
    expect(process.env.JWT_REFRESH_SECRET).toBeDefined();
  });
});
