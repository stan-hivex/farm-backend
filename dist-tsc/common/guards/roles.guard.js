"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const roles_decorator_1 = require("../decorators/roles.decorator");
const permissions_decorator_1 = require("../decorators/permissions.decorator");
const ownership_decorator_1 = require("../decorators/ownership.decorator");
const enums_1 = require("../enums");
const public_decorator_1 = require("../decorators/public.decorator");
const prisma_service_1 = require("../../database/prisma.service");
let RolesGuard = class RolesGuard {
    constructor(reflector, jwtService, configService, prismaService) {
        this.reflector = reflector;
        this.jwtService = jwtService;
        this.configService = configService;
        this.prismaService = prismaService;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
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
            throw new common_1.UnauthorizedException('Authentication token is required');
        }
        const secret = this.configService.get('JWT_ACCESS_SECRET');
        if (!secret) {
            throw new common_1.UnauthorizedException('JWT access secret is not configured');
        }
        let user = request.user;
        try {
            const payload = await this.jwtService.verifyAsync(token, { secret });
            user = this.normalizeUser(payload);
            request.user = user;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired access token');
        }
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (requiredRoles && requiredRoles.length > 0) {
            const role = String(user?.role || 'user').toLowerCase();
            const allowed = requiredRoles.map((item) => String(item).toLowerCase());
            if (role !== enums_1.UserRole.ADMIN && role !== enums_1.UserRole.SUPER_ADMIN && !allowed.includes(role)) {
                throw new common_1.ForbiddenException('Insufficient role permissions');
            }
        }
        const requiredPermissions = this.reflector.getAllAndOverride(permissions_decorator_1.PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (requiredPermissions && requiredPermissions.length > 0) {
            const role = String(user?.role || 'user').toLowerCase();
            if (role !== enums_1.UserRole.ADMIN && role !== enums_1.UserRole.SUPER_ADMIN) {
                const granted = await this.getEffectivePermissions(user, requiredPermissions);
                const missing = requiredPermissions.filter((permission) => !granted.includes(permission));
                if (missing.length > 0) {
                    throw new common_1.ForbiddenException('Insufficient permissions');
                }
            }
        }
        const ownership = this.reflector.getAllAndOverride(ownership_decorator_1.OWNERSHIP_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (ownership) {
            const ownerId = this.resolveOwnerId(user, ownership);
            const resourceId = this.resolveResourceId(request, ownership);
            if (!ownerId || !resourceId || String(ownerId) !== String(resourceId)) {
                throw new common_1.ForbiddenException('Resource ownership check failed');
            }
        }
        return true;
    }
    extractToken(authHeader) {
        if (!authHeader)
            return null;
        const [type, token] = authHeader.split(' ');
        return type === 'Bearer' && token ? token : null;
    }
    normalizeUser(payload) {
        const role = payload.role || payload.user_role || 'user';
        return {
            ...payload,
            id: payload.sub || payload.id || payload.userId,
            userId: payload.sub || payload.id || payload.userId,
            role: String(role).toLowerCase(),
        };
    }
    getPermissionsForRole(role) {
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
            case String(enums_1.UserRole.SUPER_ADMIN).toLowerCase():
            case String(enums_1.UserRole.ADMIN).toLowerCase():
                return ['*', ...basePermissions, 'admin:read', 'admin:write', 'audit:read', 'audit:write', 'superadmin:read', 'superadmin:write'];
            case String(enums_1.UserRole.MERCHANT).toLowerCase():
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
    async getEffectivePermissions(user, requiredPermissions) {
        const granted = this.getPermissionsForRole(String(user?.role || 'user').toLowerCase());
        if (requiredPermissions.some((permission) => permission.startsWith('merchant:')) && await this.userHasMerchantRecord(user?.id || user?.userId)) {
            return [...new Set([...granted, 'merchant:read', 'merchant:write'])];
        }
        return granted;
    }
    async userHasMerchantRecord(userId) {
        if (!userId || !this.prismaService) {
            return false;
        }
        const merchant = await this.prismaService.merchants.findFirst({
            where: { user_id: userId },
            select: { id: true },
        });
        return Boolean(merchant);
    }
    resolveOwnerId(user, ownership) {
        const candidate = user?.[ownership.userProperty || 'id'] || user?.id || user?.sub || user?.userId;
        return candidate ? String(candidate) : null;
    }
    resolveResourceId(request, ownership) {
        const source = ownership.source || 'params';
        const location = source === 'body'
            ? request.body
            : source === 'query'
                ? request.query
                : request.params;
        const value = location?.[ownership.param || 'id'];
        return value ? String(value) : null;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        jwt_1.JwtService,
        config_1.ConfigService,
        prisma_service_1.PrismaService])
], RolesGuard);
//# sourceMappingURL=roles.guard.js.map