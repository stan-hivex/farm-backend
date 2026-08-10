import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('uses Redis client when available', async () => {
    const mockRedisClient: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue({ del: jest.fn(), exec: jest.fn().mockResolvedValue([]) }),
    };
    const mockRedisService: any = { getClient: () => mockRedisClient };
    const cfg = new ConfigService({ CACHE_PREFIX: 'cache:', CACHE_TTL_SECONDS: '60', CACHE_ENABLED: 'true' });
    const service = new CacheService(cfg, mockRedisService);

    await expect(service.cacheGet('wallet:test:balance')).resolves.toBeNull();
    await expect(service.cacheSet('wallet:test:balance', { ok: true }, 30)).resolves.toBeUndefined();
    expect(mockRedisClient.set).toHaveBeenCalled();
    await expect(service.cacheDelete('wallet:test:balance')).resolves.toBeUndefined();
    expect(mockRedisClient.del).toHaveBeenCalled();
    await expect(service.cacheInvalidatePattern('transactions:*')).resolves.toBeUndefined();
    expect(mockRedisClient.keys).toHaveBeenCalled();
  });
});
