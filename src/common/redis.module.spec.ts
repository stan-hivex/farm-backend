import { ConfigService } from '@nestjs/config';
import { buildRedisConnectionConfig } from './redis.module';

describe('buildRedisConnectionConfig', () => {
  it('returns null in production when no Redis configuration is available', () => {
    expect(buildRedisConnectionConfig(new ConfigService({}), true)).toBeNull();
  });

  it('builds a host-based configuration when only host and port are provided', () => {
    const config = buildRedisConnectionConfig(
      new ConfigService({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'secret',
        REDIS_DB: '2',
        REDIS_TLS: 'true',
      }),
      false,
    );

    expect(config).toEqual({
      host: 'redis.internal',
      port: 6380,
      password: 'secret',
      db: 2,
      tls: {},
    });
  });

  it('allows host/port configuration in production when URL is absent', () => {
    const config = buildRedisConnectionConfig(
      new ConfigService({
        REDIS_HOST: 'production-redis.internal',
        REDIS_PORT: '6380',
        REDIS_PASSWORD: 'secret',
        REDIS_DB: '1',
      }),
      true,
    );

    expect(config).toEqual({
      host: 'production-redis.internal',
      port: 6380,
      password: 'secret',
      db: 1,
      tls: undefined,
    });
  });
});
