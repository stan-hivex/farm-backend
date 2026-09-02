import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
export declare class ProjectsService {
    private prisma;
    private cacheService;
    constructor(prisma: PrismaService, cacheService: CacheService);
    findAll(): Promise<{
        data: {
            total_value: number;
            token_price: number;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: string | null;
            description: string | null;
            project_name: string;
            category: string | null;
            banner_image: string | null;
            target_amount: import("@prisma/client/runtime/library").Decimal | null;
            raised_amount: import("@prisma/client/runtime/library").Decimal | null;
            minimum_investment: import("@prisma/client/runtime/library").Decimal | null;
            roi_percent: import("@prisma/client/runtime/library").Decimal | null;
            duration_months: number | null;
            total_backers: number | null;
            starts_at: Date | null;
            ends_at: Date | null;
            created_by: string | null;
        }[];
    }>;
    findOne(id: string): Promise<{
        data: any;
    }>;
    create(dto: any, userId: string): Promise<{
        data: any;
        message: string;
    }>;
    invest(userId: string, dto: any, ip: string): Promise<{
        data: any;
        message: string;
    }>;
}
