import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export function buildRedisConnectionConfig(cfg: ConfigService, isProduction: boolean): string | RedisOptions {
  const url = cfg.get<string>('REDIS_URL')?.trim();
  const host = cfg.get<string>('REDIS_HOST')?.trim();
  const port = Number(cfg.get<string>('REDIS_PORT', '6379'));
  const password = cfg.get<string>('REDIS_PASSWORD');
  const db = Number(cfg.get<string>('REDIS_DB', '0'));
  const tlsEnabled = cfg.get<string>('REDIS_TLS', 'false').toLowerCase() === 'true';
  const runtimeNodeEnv = (cfg.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development').toLowerCase();
  const isProductionRuntime = isProduction || runtimeNodeEnv === 'production' || process.env.RENDER === 'true';
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (url) {
    return url;
  }

  if (isProductionRuntime) {
    throw new Error('REDIS_URL is required in production');
  }

  if (!host) {
    return {
      host: '127.0.0.1',
      port: 6379,
      password,
      db,
      tls: tlsEnabled ? {} : undefined,
    };
  }

  if (isLoopbackHost) {
    return {
      host: '127.0.0.1',
      port: 6379,
      password,
      db,
      tls: tlsEnabled ? {} : undefined,
    };
  }

  return {
    host,
    port,
    password,
    db,
    tls: tlsEnabled ? {} : undefined,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (cfg: ConfigService) => {
        const isProduction = (process.env.NODE_ENV || 'development') === 'production';
        const logger = new Logger('RedisModule');

        try {
          const redisConfig = buildRedisConnectionConfig(cfg, isProduction);
          const client = new Redis(redisConfig as any);

          const host = typeof redisConfig === 'string' ? new URL(redisConfig).hostname : redisConfig.host;
          const port = typeof redisConfig === 'string' ? Number(new URL(redisConfig).port || 6379) : redisConfig.port;
          const hasUrl = Boolean(cfg.get<string>('REDIS_URL'));
          logger.log(hasUrl ? 'Redis: connecting to configured REDIS_URL' : `Redis: connecting to ${host ?? 'unknown'}:${port ?? 'unknown'}`);

          client.on('error', (error: Error) => {
            logger.warn(`Redis connection error: ${error.message}`);
          });

          client.on('connect', () => {
            logger.log('Connected to Redis successfully');
          });

          try {
            await client.ping();
            logger.log(`Redis: connected successfully`);
            return client;
          } catch (pingError) {
            const message = pingError instanceof Error ? pingError.message : String(pingError);
            logger.error(`Redis: connection failed (${message})`);
            if (isProduction) {
              throw new Error(`Redis health check failed: ${message}`);
            }
            logger.warn('Redis health check failed in development; continuing without Redis-backed features.');
            return client;
          }
        } catch (error) {
          logger.error(`Redis initialization failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
