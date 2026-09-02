import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
export declare const REQUIRE_API_KEY = "requireApiKey";
export declare const RequireApiKey: () => import("@nestjs/common").CustomDecorator<string>;
export declare class ApiKeyGuard implements CanActivate {
    private reflector;
    private prisma;
    constructor(reflector: Reflector, prisma: PrismaService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
