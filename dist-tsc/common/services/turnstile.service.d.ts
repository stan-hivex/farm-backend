import { ConfigService } from '@nestjs/config';
export interface TurnstileVerifyResponse {
    success: boolean;
    challenge_ts: string;
    hostname: string;
    'error-codes': string[];
    score?: number;
    score_reason?: string[];
}
export declare class TurnstileService {
    private cfg;
    private readonly logger;
    private readonly TURNSTILE_VERIFY_URL;
    constructor(cfg: ConfigService);
    verifyToken(token?: string, remoteIp?: string): Promise<TurnstileVerifyResponse>;
    verifyWithScore(token?: string, minScore?: number, remoteIp?: string): Promise<TurnstileVerifyResponse>;
}
