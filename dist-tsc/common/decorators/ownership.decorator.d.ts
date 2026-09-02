export interface OwnershipConfig {
    param?: string;
    source?: 'params' | 'body' | 'query';
    userProperty?: string;
    allowAdmin?: boolean;
}
export declare const OWNERSHIP_KEY = "ownership";
export declare const RequireOwnership: (config: OwnershipConfig | string) => import("@nestjs/common").CustomDecorator<string>;
