import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
export declare class AnalyticsService {
    private prisma;
    private cache;
    constructor(prisma: PrismaService, cache: CacheService);
    getPlatformStats(period?: 'day' | 'week' | 'month'): Promise<any>;
    getTransactionVolume(days?: number): Promise<any>;
    getUserGrowthHistory(userId: string, days?: number, period?: string): Promise<any>;
}
