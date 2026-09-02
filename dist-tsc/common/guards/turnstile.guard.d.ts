import { CanActivate, ExecutionContext } from '@nestjs/common';
import { TurnstileService } from '../services/turnstile.service';
export declare class TurnstileGuard implements CanActivate {
    private turnstile;
    private readonly logger;
    constructor(turnstile: TurnstileService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
