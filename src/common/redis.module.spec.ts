import { ConfigService } from '@nestjs/config';
import { buildRedisConnectionConfig } from './redis.module';

describe('buildRedisConnectionConfig', () => {
  it('throws in production when no Redis configuration is available', () => {
    expect(() => buildRedisConnectionConfig(new ConfigService({}), true)).toThrow('REDIS_URL is required in production');
  });

  it('throws when only host-based Redis settings are provided in development', () => {
    expect(() =>
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_HOST: 'redis.internal',
          REDIS_PORT: '6380',
          REDIS_PASSWORD: 'secret',
          REDIS_DB: '2',
          REDIS_TLS: 'true',
        }),
        false,
      ),
    ).toThrow('REDIS_URL is required for local development too; localhost fallback is disabled.');
  });

  it('throws when localhost is configured even in development mode', () => {
    expect(() =>
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
        }),
        false,
      ),
    ).toThrow('REDIS_URL is required for local development too; localhost fallback is disabled.');
  });

  it('throws in production when a URL is absent even if a host is present', () => {
    expect(() =>
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_HOST: 'production-redis.internal',
          REDIS_PORT: '6380',
          REDIS_PASSWORD: 'secret',
          REDIS_DB: '1',
        }),
        true,
      ),
    ).toThrow('REDIS_URL is required in production');
  });

  it('throws in production when localhost is configured', () => {
    expect(() =>
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
        }),
        true,
      ),
    ).toThrow('REDIS_URL is required in production');
  });
});
