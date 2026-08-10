import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {
  private readonly logger = new Logger(RedisModule.name);
  static async forRootAsync(cfg: ConfigService, redisService: RedisService) {
    const url = cfg.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL must be set in the environment and point to an external managed Redis instance');
    }

    await redisService.initFromUrl(url);
    return {
      module: RedisModule,
      providers: [RedisService],
      exports: [RedisService],
    };
  }
}
