import { HealthService } from './health.service';
export declare class HealthController {
    private readonly svc;
    constructor(svc: HealthService);
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
