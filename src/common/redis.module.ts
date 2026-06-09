import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

function getOptionalString(cfg: ConfigService, key: string): string | undefined {
  return cfg.get<string>(key) ?? undefined;
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) => {
        const url = getOptionalString(cfg, 'REDIS_URL');
        if (!url) {
          return null;
        }

        const logger = new Logger('RedisModule');
        const client = new Redis(url);

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
