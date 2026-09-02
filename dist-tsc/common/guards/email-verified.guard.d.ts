import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class EmailVerifiedGuard implements CanActivate {
    canActivate(_context: ExecutionContext): boolean;
}
