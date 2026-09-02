import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly jwtService;
    private readonly configService;
    private readonly prismaService?;
    constructor(reflector: Reflector, jwtService: JwtService, configService: ConfigService, prismaService?: PrismaService | undefined);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractToken;
    private normalizeUser;
    private getPermissionsForRole;
    private getEffectivePermissions;
    private userHasMerchantRecord;
    private resolveOwnerId;
    private resolveResourceId;
}
