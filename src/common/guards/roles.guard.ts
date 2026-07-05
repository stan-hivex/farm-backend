import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { OWNERSHIP_KEY, OwnershipConfig } from '../decorators/ownership.decorator';
import { UserRole } from '../enums';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization || request.headers?.Authorization;
    const token = this.extractToken(authHeader);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT access secret is not configured');
    }

    let user = request.user;
    try {
      const payload = await this.jwtService.verifyAsync(token, { secret });
      user = this.normalizeUser(payload);
      request.user = user;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const role = String(user?.role || 'user').toLowerCase();
      const allowed = requiredRoles.map((item) => String(item).toLowerCase());
      if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN && !allowed.includes(role)) {
        throw new ForbiddenException('Insufficient role permissions');
      }
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredPermissions && requiredPermissions.length > 0) {
      const role = String(user?.role || 'user').toLowerCase();
      if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
        const granted = this.getPermissionsForRole(role);
        const missing = requiredPermissions.filter((permission) => !granted.includes(permission));
        if (missing.length > 0) {
          throw new ForbiddenException('Insufficient permissions');
        }
      }
    }

    const ownership = this.reflector.getAllAndOverride<OwnershipConfig>(OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (ownership) {
      const ownerId = this.resolveOwnerId(user, ownership);
      const resourceId = this.resolveResourceId(request, ownership);
      if (!ownerId || !resourceId || String(ownerId) !== String(resourceId)) {
        throw new ForbiddenException('Resource ownership check failed');
      }
    }

    return true;
  }

  private extractToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }

  private normalizeUser(payload: any) {
    const role = payload.role || payload.user_role || 'user';
    return {
      ...payload,
      id: payload.sub || payload.id || payload.userId,
      userId: payload.sub || payload.id || payload.userId,
      role: String(role).toLowerCase(),
    };
  }

  private getPermissionsForRole(role: string): string[] {
    const normalizedRole = String(role).toLowerCase();

    const basePermissions = [
      'profile:read',
      'profile:write',
      'wallet:read',
      'wallet:write',
      'payments:read',
      'payments:write',
      'transactions:read',
      'transfer:read',
      'transfer:write',
      'escrow:read',
      'escrow:write',
      'withdraw:read',
      'withdraw:write',
      'kyc:read',
      'kyc:write',
      'sessions:read',
      'sessions:write',
      'auth:write',
      'notifications:read',
      'notifications:write',
      'security:read',
      'security:write',
      'settings:read',
      'settings:write',
      'analytics:read',
      'investments:read',
      'investments:write',
      'projects:read',
      'projects:write',
      'qr:read',
      'qr:write',
    ];

    switch (normalizedRole) {
      case String(UserRole.SUPER_ADMIN).toLowerCase():
      case String(UserRole.ADMIN).toLowerCase():
        return ['*', ...basePermissions, 'admin:read', 'admin:write', 'audit:read', 'audit:write', 'superadmin:read', 'superadmin:write'];
      case String(UserRole.MERCHANT).toLowerCase():
        return [
          ...basePermissions,
          'merchant:read',
          'merchant:write',
          'payments:read',
          'payments:write',
        ];
      default:
        return basePermissions;
    }
  }

  private resolveOwnerId(user: any, ownership: OwnershipConfig): string | null {
    const candidate = user?.[ownership.userProperty || 'id'] || user?.id || user?.sub || user?.userId;
    return candidate ? String(candidate) : null;
  }

  private resolveResourceId(request: any, ownership: OwnershipConfig): string | null {
    const source = ownership.source || 'params';
    const location = source === 'body'
      ? request.body
      : source === 'query'
        ? request.query
        : request.params;

    const value = location?.[ownership.param || 'id'];
    return value ? String(value) : null;
  }
}