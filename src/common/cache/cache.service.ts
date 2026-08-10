import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private readonly enabled: boolean;

  constructor(private readonly cfg: ConfigService) {
    this.prefix = this.cfg.get<string>('CACHE_PREFIX', 'cache:');
    this.defaultTtl = Number(this.cfg.get<string>('CACHE_TTL_SECONDS', '60'));
    this.enabled = this.cfg.get<string>('CACHE_ENABLED', 'true').toLowerCase() !== 'false';
  }

  private buildKey(key: string) {
    return `${this.prefix}${key}`;
  }

  private isAvailable() {
    return false;
  }

  async get<T>(key: string): Promise<T | null> {
    return null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return;
  }

  async del(key: string): Promise<void> {
    return;
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
    return;
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
