export declare class PasswordResetRateLimiter {
    private readonly windowMs;
    private readonly maxAttempts;
    private readonly buckets;
    constructor(windowMs?: number, maxAttempts?: number);
    allowRequest(key: string, now?: number): boolean;
    reset(key: string): void;
}
export declare function generatePasswordResetToken(bytes?: number): string;
