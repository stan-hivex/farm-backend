import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly prefix: string;
  private readonly defaultTtl: number;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis | null,
    private readonly cfg: ConfigService,
  ) {
    this.prefix = this.cfg.get<string>('CACHE_PREFIX', 'cache:');
    this.defaultTtl = Number(this.cfg.get<number>('CACHE_TTL_SECONDS', 60));
  }

  private buildKey(key: string) {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(this.buildKey(key));
      if (!cached) return null;
      return JSON.parse(cached) as T;
    } catch (error) {
      this.logger.warn(`Cache get failed for key ${key}: ${error}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.redis) return;

    try {
      const payload = JSON.stringify(value);
      const expires = ttlSeconds ?? this.defaultTtl;
      await this.redis.set(this.buildKey(key), payload, 'EX', expires);
    } catch (error) {
      this.logger.warn(`Cache set failed for key ${key}: ${error}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(this.buildKey(key));
    } catch (error) {
      this.logger.warn(`Cache delete failed for key ${key}: ${error}`);
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
