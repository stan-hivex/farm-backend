import { InvestmentsService } from './investments.service';
declare class InvestDto {
    amount: number;
    pin: string;
}
export declare class InvestmentsController {
    private readonly svc;
    constructor(svc: InvestmentsService);
    list(q: any): Promise<{
        data: {
            target_amount: number;
            raised_amount: number;
            minimum_investment: number;
            roi_percent: number;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: string | null;
            description: string | null;
            project_name: string;
            category: string | null;
            banner_image: string | null;
            duration_months: number | null;
            total_backers: number | null;
            starts_at: Date | null;
            ends_at: Date | null;
            created_by: string | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    mine(u: any, q: any): Promise<{
        data: {
            amount: number;
            expected_roi: number;
            investment_projects: {
                status: string | null;
                project_name: string;
                roi_percent: import("@prisma/client/runtime/library").Decimal | null;
            } | null;
            id: string;
            status: string | null;
            user_id: string | null;
            transaction_id: string | null;
            project_id: string | null;
            invested_at: Date | null;
            maturity_date: Date | null;
        }[];
        meta: {
            total_invested: number;
            total: number;
            page: number;
            limit: number;
            last_page: number;
            has_next: boolean;
            has_prev: boolean;
        };
    }>;
    get(id: string): Promise<{
        data: {
            target_amount: number;
            raised_amount: number;
            minimum_investment: number;
            roi_percent: number;
            funding_progress: number;
            id: string;
            created_at: Date | null;
            updated_at: Date | null;
            status: string | null;
            description: string | null;
            project_name: string;
            category: string | null;
            banner_image: string | null;
            duration_months: number | null;
            total_backers: number | null;
            starts_at: Date | null;
            ends_at: Date | null;
            created_by: string | null;
        };
    }>;
    invest(u: any, id: string, dto: InvestDto): Promise<{
        data: {
            amount: number;
            expected_roi: number;
            id: string;
            status: string | null;
            user_id: string | null;
            transaction_id: string | null;
            project_id: string | null;
            invested_at: Date | null;
            maturity_date: Date | null;
        };
        message: string;
    }>;
}
export {};
