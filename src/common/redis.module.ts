import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) => {
        const url = cfg.get<string>('REDIS_URL');
        const host = cfg.get<string>('REDIS_HOST', '127.0.0.1');
        const port = Number(cfg.get<string>('REDIS_PORT', '6379'));
        const password = cfg.get<string>('REDIS_PASSWORD');
        const db = Number(cfg.get<string>('REDIS_DB', '0'));
        const tlsEnabled = cfg.get<string>('REDIS_TLS', 'false').toLowerCase() === 'true';

        if (!url && !host) {
          return null;
        }

        const logger = new Logger('RedisModule');
        const redisConfig: any = url ?? {
          host,
          port,
          password,
          db,
          tls: tlsEnabled ? {} : undefined,
        };
        const client = new Redis(redisConfig);

        client.on('error', (error: Error) => {
          logger.warn(`Redis connection error: ${error.message}`);
        });

        client.on('connect', () => {
          logger.log('Connected to Redis successfully');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
