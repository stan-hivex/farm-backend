import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('uses Redis client when available', async () => {
    const mockRedisClient: any = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      scan: jest.fn().mockResolvedValue(['0', []]),
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
    expect(mockRedisClient.scan).toHaveBeenCalled();
  });

  it('caps the default cache TTL at 60 seconds', async () => {
    const mockRedisClient: any = {
      set: jest.fn().mockResolvedValue('OK'),
    };
    const mockRedisService: any = { getClient: () => mockRedisClient };
    const cfg = new ConfigService({
      CACHE_PREFIX: 'cache:',
      CACHE_TTL_SECONDS: '300',
      CACHE_ENABLED: 'true',
    });
    const service = new CacheService(cfg, mockRedisService);

    await service.cacheSet('wallet:test:balance', { balance: 10 });

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      'cache:wallet:test:balance',
      '{"balance":10}',
      'EX',
      60,
    );
  });

  it('invalidates the exact and namespaced wallet cache keys', async () => {
    const mockRedisClient: any = {
      del: jest.fn().mockResolvedValue(1),
      scan: jest.fn().mockResolvedValue(['0', []]),
    };
    const mockRedisService: any = { getClient: () => mockRedisClient };
    const cfg = new ConfigService({
      CACHE_PREFIX: 'cache:',
      CACHE_TTL_SECONDS: '60',
      CACHE_ENABLED: 'true',
    });
    const service = new CacheService(cfg, mockRedisService);

    await service.invalidateWallet('user-1');

    expect(mockRedisClient.del).toHaveBeenCalledWith(
      'cache:wallet:user-1:balance',
    );
    expect(mockRedisClient.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      'cache:wallet:user-1:*',
      'COUNT',
      200,
    );
  });
});
