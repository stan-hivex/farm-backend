import { AnalyticsService } from './analytics.service';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getGrowthHistory(req: any, days?: string, period?: string): Promise<any>;
}
