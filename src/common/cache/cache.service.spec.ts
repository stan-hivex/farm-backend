import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('is a no-op cache implementation when Redis is removed', async () => {
    const service = new CacheService(new ConfigService({ CACHE_PREFIX: 'cache:', CACHE_TTL_SECONDS: '60' }));

    await expect(service.cacheGet('wallet:test:balance')).resolves.toBeNull();
    await expect(service.cacheSet('wallet:test:balance', { ok: true }, 30)).resolves.toBeUndefined();
    await expect(service.cacheDelete('wallet:test:balance')).resolves.toBeUndefined();
    await expect(service.cacheInvalidatePattern('transactions:*')).resolves.toBeUndefined();
  });
});
