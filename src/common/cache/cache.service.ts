import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private readonly enabled: boolean;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis | null,
    private readonly cfg: ConfigService,
  ) {
    this.prefix = this.cfg.get<string>('CACHE_PREFIX', 'cache:');
    this.defaultTtl = Number(this.cfg.get<string>('CACHE_TTL_SECONDS', '60'));
    this.enabled = this.cfg.get<string>('CACHE_ENABLED', 'true').toLowerCase() !== 'false';
  }

  private buildKey(key: string) {
    return `${this.prefix}${key}`;
  }

  private isAvailable() {
    return this.enabled && !!this.redis;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const cached = await this.redis!.get(this.buildKey(key));
      if (!cached) {
        this.logger.debug(`[cache-miss] ${key}`);
        return null;
      }
      this.logger.debug(`[cache-hit] ${key}`);
      return JSON.parse(cached) as T;
    } catch (error) {
      this.logger.warn(`[cache-error] get failed for ${key}: ${error}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const payload = JSON.stringify(value);
      const expires = ttlSeconds ?? this.defaultTtl;
      await this.redis!.set(this.buildKey(key), payload, 'EX', expires);
      this.logger.debug(`[cache-set] ${key} ttl=${expires}`);
    } catch (error) {
      this.logger.warn(`[cache-error] set failed for ${key}: ${error}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis!.del(this.buildKey(key));
      this.logger.debug(`[cache-delete] ${key}`);
    } catch (error) {
      this.logger.warn(`[cache-error] delete failed for ${key}: ${error}`);
    }
  }

  async cacheGet<T>(key: string): Promise<T | null> {
    return this.get<T>(key);
  }

  async cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return this.set(key, value, ttlSeconds);
  }

  async cacheDelete(key: string): Promise<void> {
    return this.del(key);
  }

  async cacheInvalidatePattern(pattern: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const fullPattern = this.buildKey(pattern);
      const stream = this.redis!.scanStream({ match: fullPattern, count: 100 });
      const keysToDelete: string[] = [];

      for await (const keys of stream) {
        if (keys.length > 0) {
          keysToDelete.push(...keys);
        }

        if (keysToDelete.length >= 100) {
          await this.redis!.del(...keysToDelete.splice(0, keysToDelete.length));
        }
      }

      if (keysToDelete.length > 0) {
        await this.redis!.del(...keysToDelete);
      }

      this.logger.debug(`[cache-invalidate] ${pattern}`);
    } catch (error) {
      this.logger.warn(`[cache-error] invalidate pattern failed for ${pattern}: ${error}`);
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fetch: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fetch();
    await this.set(key, result, ttlSeconds);
    return result;
  }
}
