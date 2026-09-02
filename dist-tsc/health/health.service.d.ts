import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../common/redis/redis.service';
export declare class HealthService {
    private prisma;
    private redis?;
    constructor(prisma: PrismaService, redis?: RedisService | undefined);
    check(): Promise<{
        status: string;
        version: string;
        environment: string | undefined;
        checks: {
            database: {
                status: string;
                latency_ms: number;
            };
            redis: {
                status: string;
                latency_ms: number | null;
            };
            memory: {
                heap_used_mb: number;
            };
        };
        timestamp: string;
    }>;
}
