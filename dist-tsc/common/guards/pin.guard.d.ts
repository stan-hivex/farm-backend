import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
export declare const REQUIRE_PIN_KEY = "requirePin";
export declare const RequirePin: () => import("@nestjs/common").CustomDecorator<string>;
export declare class PinGuard implements CanActivate {
    private reflector;
    private authService;
    constructor(reflector: Reflector, authService: AuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
