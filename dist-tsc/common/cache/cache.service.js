"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../redis/redis.service");
let CacheService = CacheService_1 = class CacheService {
    constructor(cfg, redis) {
        this.cfg = cfg;
        this.redis = redis;
        this.logger = new common_1.Logger(CacheService_1.name);
        this.inFlight = new Map();
        this.prefix = this.cfg.get('CACHE_PREFIX', 'cache:');
        this.defaultTtl = Number(this.cfg.get('CACHE_TTL_SECONDS', '60'));
        this.enabled = this.cfg.get('CACHE_ENABLED', 'true').toLowerCase() !== 'false';
    }
    buildKey(key) {
        return `${this.prefix}${key}`;
    }
    isAvailable() {
        return Boolean(this.enabled && this.redis && this.redis.getClient());
    }
    async get(key) {
        if (!this.isAvailable())
            return null;
        try {
            const client = this.redis?.getClient();
            if (!client)
                return null;
            const raw = await client.get(this.buildKey(key));
            if (raw == null)
                return null;
            try {
                return JSON.parse(raw);
            }
            catch (e) {
                return raw;
            }
        }
        catch (e) {
            this.logger.warn('Cache get failed', e);
            return null;
        }
    }
    async set(key, value, ttlSeconds) {
        if (!this.isAvailable())
            return;
        try {
            const client = this.redis?.getClient();
            if (!client)
                return;
            const raw = typeof value === 'string' ? value : JSON.stringify(value);
            if (ttlSeconds && ttlSeconds > 0) {
                await client.set(this.buildKey(key), raw, 'EX', Math.ceil(ttlSeconds));
            }
            else {
                await client.set(this.buildKey(key), raw);
            }
        }
        catch (e) {
            this.logger.warn('Cache set failed', e);
        }
    }
    async del(key) {
        if (!this.isAvailable())
            return;
        try {
            const client = this.redis?.getClient();
            if (!client)
                return;
            await client.del(this.buildKey(key));
        }
        catch (e) {
            this.logger.warn('Cache delete failed', e);
        }
    }
    async cacheGet(key) {
        return this.get(key);
    }
    async cacheSet(key, value, ttlSeconds) {
        return this.set(key, value, ttlSeconds);
    }
    async cacheDelete(key) {
        return this.del(key);
    }
    async cacheInvalidatePattern(pattern) {
        if (!this.isAvailable())
            return;
        try {
            const client = this.redis?.getClient();
            if (!client)
                return;
            const matchedKeys = [];
            let cursor = '0';
            do {
                const [nextCursor, keys] = await client.scan(cursor, 'MATCH', this.buildKey(pattern), 'COUNT', 200);
                cursor = nextCursor;
                matchedKeys.push(...keys);
            } while (cursor !== '0');
            for (let offset = 0; offset < matchedKeys.length; offset += 200) {
                await client.del(...matchedKeys.slice(offset, offset + 200));
            }
        }
        catch (e) {
            this.logger.warn('Cache invalidate pattern failed', e);
        }
    }
    async wrap(key, ttlSeconds, fetch) {
        const cached = await this.get(key);
        if (cached !== null) {
            return cached;
        }
        const existing = this.inFlight.get(key);
        if (existing)
            return existing;
        const pending = (async () => {
            const result = await fetch();
            await this.set(key, result, ttlSeconds ?? this.defaultTtl);
            return result;
        })();
        this.inFlight.set(key, pending);
        try {
            return await pending;
        }
        finally {
            if (this.inFlight.get(key) === pending) {
                this.inFlight.delete(key);
            }
        }
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService, redis_service_1.RedisService])
], CacheService);
//# sourceMappingURL=cache.service.js.map