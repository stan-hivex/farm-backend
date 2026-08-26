import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private readonly enabled: boolean;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly cfg: ConfigService, @Optional() private readonly redis?: RedisService) {
    this.prefix = this.cfg.get<string>('CACHE_PREFIX', 'cache:');
    this.defaultTtl = Number(this.cfg.get<string>('CACHE_TTL_SECONDS', '60'));
    this.enabled = this.cfg.get<string>('CACHE_ENABLED', 'true').toLowerCase() !== 'false';
  }

  private buildKey(key: string) {
    return `${this.prefix}${key}`;
  }

  private isAvailable() {
    return Boolean(this.enabled && this.redis && this.redis.getClient());
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const client = this.redis?.getClient();
      if (!client) return null;
      const raw = await client.get(this.buildKey(key));
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch (e) {
        return (raw as unknown) as T;
      }
    } catch (e) {
      this.logger.warn('Cache get failed', e as any);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const client = this.redis?.getClient();
      if (!client) return;
      const raw = typeof value === 'string' ? (value as unknown as string) : JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(this.buildKey(key), raw, 'EX', Math.ceil(ttlSeconds));
      } else {
        await client.set(this.buildKey(key), raw);
      }
    } catch (e) {
      this.logger.warn('Cache set failed', e as any);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const client = this.redis?.getClient();
      if (!client) return;
      await client.del(this.buildKey(key));
    } catch (e) {
      this.logger.warn('Cache delete failed', e as any);
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
      const client = this.redis?.getClient();
      if (!client) return;
      const matchedKeys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          this.buildKey(pattern),
          'COUNT',
          200,
        );
        cursor = nextCursor;
        matchedKeys.push(...keys);
      } while (cursor !== '0');

      for (let offset = 0; offset < matchedKeys.length; offset += 200) {
        await client.del(...matchedKeys.slice(offset, offset + 200));
      }
    } catch (e) {
      this.logger.warn('Cache invalidate pattern failed', e as any);
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, fetch: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const pending = (async () => {
      const result = await fetch();
      await this.set(key, result, ttlSeconds ?? this.defaultTtl);
      return result;
    })();
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) {
        this.inFlight.delete(key);
      }
    }
  }
}
