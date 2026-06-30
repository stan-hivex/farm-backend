import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('uses the configured Redis client for get/set/delete helpers', async () => {
    const redis = {
      get: jest.fn().mockResolvedValue('{"ok":true}'),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue(['cache:transactions:1:1:10']),
    };

    const service = new CacheService(redis as any, new ConfigService({ CACHE_PREFIX: 'cache:', CACHE_TTL_SECONDS: '60' }));

    await expect(service.cacheGet('wallet:test:balance')).resolves.toEqual({ ok: true });
    await service.cacheSet('wallet:test:balance', { ok: true }, 30);
    await service.cacheDelete('wallet:test:balance');
    await service.cacheInvalidatePattern('transactions:*');

    expect(redis.get).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
    expect(redis.keys).toHaveBeenCalledWith('cache:transactions:*');
  });
});
