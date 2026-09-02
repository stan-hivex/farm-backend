import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class WebhookSignatureGuard implements CanActivate {
    private cfg;
    private readonly logger;
    constructor(cfg: ConfigService);
    canActivate(context: ExecutionContext): boolean;
    private verifyPaystack;
    private verifyIvorypay;
}
