import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
export declare class SettingsService {
    private prisma;
    private cache;
    constructor(prisma: PrismaService, cache: CacheService);
    updateLanguage(userId: string, language: string): Promise<{
        success: boolean;
        message: string;
    }>;
    updateTheme(userId: string, theme: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
