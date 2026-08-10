import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

export function buildRedisConnectionConfig(cfg: ConfigService, isProduction: boolean): string | RedisOptions | null {
  const url = cfg.get<string>('REDIS_URL');
  const host = cfg.get<string>('REDIS_HOST');
  const port = Number(cfg.get<string>('REDIS_PORT', '6379'));
  const password = cfg.get<string>('REDIS_PASSWORD');
  const db = Number(cfg.get<string>('REDIS_DB', '0'));
  const tlsEnabled = cfg.get<string>('REDIS_TLS', 'false').toLowerCase() === 'true';
  const runtimeNodeEnv = (cfg.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development').toLowerCase();
  const isProductionRuntime = isProduction || runtimeNodeEnv === 'production' || process.env.RENDER === 'true';

  if (url) {
    return url;
  }

  if (!host && isProductionRuntime) {
    return null;
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
      useFactory: (cfg: ConfigService) => {
        const isProduction = (process.env.NODE_ENV || 'development') === 'production';
        const logger = new Logger('RedisModule');

        try {
          const redisConfig = buildRedisConnectionConfig(cfg, isProduction);
          if (!redisConfig) {
            logger.warn('Redis disabled because no Redis connection configuration was provided.');
            return null;
          }

          const client = new Redis(redisConfig as any);

          client.on('error', (error: Error) => {
            logger.warn(`Redis connection error: ${error.message}`);
          });

          client.on('connect', () => {
            logger.log('Connected to Redis successfully');
          });

          return client;
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
