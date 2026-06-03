import { Global, Module } from '@nestjs/common';
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
        return url ? new Redis(url) : null;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
