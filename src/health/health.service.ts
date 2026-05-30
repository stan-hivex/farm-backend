import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService) {}

  async check() {
    let db = 'ok';
    let dbLatency = 0;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - start;
    } catch { db = 'error'; }

    return {
      status: db === 'ok' ? 'healthy' : 'degraded',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
      checks: {
        database: { status: db, latency_ms: dbLatency },
        memory: { heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
      },
      timestamp: new Date().toISOString(),
    };
  }
}