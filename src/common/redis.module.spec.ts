import { ConfigService } from '@nestjs/config';
import { buildRedisConnectionConfig } from './redis.module';

describe('buildRedisConnectionConfig', () => {
  it('returns null by default because Redis is suspended for this app', () => {
    expect(buildRedisConnectionConfig(new ConfigService({}), true)).toBeNull();
  });

  it('returns null when only host-based Redis settings are provided in development while Redis is suspended', () => {
    expect(
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
    ).toBeNull();
  });

  it('returns null when localhost is configured while Redis is suspended', () => {
    expect(
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
        }),
        false,
      ),
    ).toBeNull();
  });

  it('returns the Redis URL when Redis is explicitly re-enabled', () => {
    expect(
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_DISABLED: 'false',
          REDIS_URL: 'redis://localhost:6379',
        }),
        true,
      ),
    ).toBe('redis://localhost:6379');
  });

  it('throws in production when Redis is explicitly re-enabled without a URL', () => {
    expect(() =>
      buildRedisConnectionConfig(
        new ConfigService({
          REDIS_DISABLED: 'false',
          REDIS_HOST: 'localhost',
          REDIS_PORT: '6379',
        }),
        true,
      ),
    ).toThrow('REDIS_URL is required in production');
  });
});
