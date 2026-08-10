import { ConfigService } from '@nestjs/config';
import { buildRedisConnectionConfig } from './redis.module';

describe('buildRedisConnectionConfig', () => {
  it('throws in production when no Redis configuration is available', () => {
    expect(() => buildRedisConnectionConfig(new ConfigService({}), true)).toThrow('REDIS_URL is required in production');
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

  it('throws in production when a URL is absent', () => {
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
