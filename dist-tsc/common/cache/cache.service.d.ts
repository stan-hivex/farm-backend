import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
export declare class CacheService {
    private readonly cfg;
    private readonly redis?;
    private readonly logger;
    private readonly prefix;
    private readonly defaultTtl;
    private readonly enabled;
    private readonly inFlight;
    constructor(cfg: ConfigService, redis?: RedisService | undefined);
    private buildKey;
    private isAvailable;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    cacheGet<T>(key: string): Promise<T | null>;
    cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    cacheDelete(key: string): Promise<void>;
    cacheInvalidatePattern(pattern: string): Promise<void>;
    wrap<T>(key: string, ttlSeconds: number, fetch: () => Promise<T>): Promise<T>;
}
