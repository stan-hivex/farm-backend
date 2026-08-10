import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export function isRedisEnabled(cfg: ConfigService): boolean {
  const raw = cfg.get<string>('REDIS_DISABLED') ?? process.env.REDIS_DISABLED ?? 'true';
  return raw.toLowerCase() !== 'true';
}

export function buildRedisConnectionConfig(cfg: ConfigService, isProduction: boolean): string | RedisOptions | null {
  if (!isRedisEnabled(cfg)) {
    return null;
  }

  const url = cfg.get<string>('REDIS_URL')?.trim();
  const runtimeNodeEnv = (cfg.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development').toLowerCase();
  const isProductionRuntime = isProduction || runtimeNodeEnv === 'production' || process.env.RENDER === 'true';

  if (url) {
    return url;
  }

  if (isProductionRuntime) {
    throw new Error('REDIS_URL is required in production');
  }

  throw new Error('REDIS_URL is required for local development too; localhost fallback is disabled.');
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
          if (!isRedisEnabled(cfg)) {
            logger.warn('Redis is suspended for this application. No Redis client will be initialized.');
            return null;
          }

          const redisConfig = buildRedisConnectionConfig(cfg, isProduction);
          if (!redisConfig) {
            logger.warn('Redis is suspended for this application. No Redis client will be initialized.');
            return null;
          }

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
            logger.log('Redis: connected successfully');
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
