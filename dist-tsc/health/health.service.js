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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
let HealthService = class HealthService {
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async check() {
        let db = 'ok';
        let dbLatency = 0;
        try {
            const start = Date.now();
            await this.prisma.$queryRaw `SELECT 1`;
            dbLatency = Date.now() - start;
        }
        catch {
            db = 'error';
        }
        let redisStatus = 'unknown';
        let redisLatency = null;
        try {
            if (this.redis) {
                const start = Date.now();
                const ok = await this.redis.isHealthy();
                redisLatency = Date.now() - start;
                redisStatus = ok ? 'ok' : 'error';
            }
            else {
                redisStatus = 'unconfigured';
            }
        }
        catch {
            redisStatus = 'error';
        }
        return {
            status: db === 'ok' ? 'healthy' : 'degraded',
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV,
            checks: {
                database: { status: db, latency_ms: dbLatency },
                redis: { status: redisStatus, latency_ms: redisLatency },
                memory: { heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
            },
            timestamp: new Date().toISOString(),
        };
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, redis_service_1.RedisService])
], HealthService);
//# sourceMappingURL=health.service.js.map