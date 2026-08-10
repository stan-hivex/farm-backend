import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService, @Optional() private redis?: RedisService) {}

  async check() {
    let db = 'ok';
    let dbLatency = 0;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - start;
    } catch { db = 'error'; }

    let redisStatus = 'unknown';
    let redisLatency: number | null = null;
    try {
      if (this.redis) {
        const start = Date.now();
        const ok = await this.redis.isHealthy();
        redisLatency = Date.now() - start;
        redisStatus = ok ? 'ok' : 'error';
      } else {
        redisStatus = 'unconfigured';
      }
    } catch {
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
}