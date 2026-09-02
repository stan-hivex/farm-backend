import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { InvestProjectDto } from './dto/invest-project.dto';
import type { Request } from 'express';
export declare class ProjectsController {
    private readonly svc;
    constructor(svc: ProjectsService);
    getAll(): Promise<{
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
    getOne(id: string): Promise<{
        data: any;
    }>;
    create(dto: CreateProjectDto, user: any): Promise<{
        data: any;
        message: string;
    }>;
    invest(dto: InvestProjectDto, user: any, req: Request): Promise<{
        data: any;
        message: string;
    }>;
}
