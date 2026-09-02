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
exports.ApiKeyGuard = exports.RequireApiKey = exports.REQUIRE_API_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../../database/prisma.service");
const api_key_hash_service_1 = require("../security/api-key-hash.service");
exports.REQUIRE_API_KEY = 'requireApiKey';
const RequireApiKey = () => (0, common_1.SetMetadata)(exports.REQUIRE_API_KEY, true);
exports.RequireApiKey = RequireApiKey;
let ApiKeyGuard = class ApiKeyGuard {
    constructor(reflector, prisma) {
        this.reflector = reflector;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const requireApiKey = this.reflector.getAllAndOverride(exports.REQUIRE_API_KEY, [
            context.getHandler(), context.getClass(),
        ]);
        if (!requireApiKey)
            return true;
        const request = context.switchToHttp().getRequest();
        const apiKey = request.headers['x-api-key'];
        if (!apiKey)
            throw new common_1.UnauthorizedException('API key required');
        const key = await this.prisma.api_keys.findFirst({
            where: {
                expires_at: { gt: new Date() },
            },
            include: { users: { select: { id: true, role: true, is_active: true } } },
        });
        if (!key || !key.users?.is_active || !key.api_key_hash) {
            throw new common_1.UnauthorizedException('Invalid or expired API key');
        }
        const isValid = await api_key_hash_service_1.ApiKeyHashService.compareKeys(apiKey, key.api_key_hash);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid or expired API key');
        }
        await this.prisma.api_keys.update({
            where: { id: key.id },
            data: { last_used_at: new Date() },
        });
        request.user = { id: key.users.id, role: key.users.role };
        return true;
    }
};
exports.ApiKeyGuard = ApiKeyGuard;
exports.ApiKeyGuard = ApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector, prisma_service_1.PrismaService])
], ApiKeyGuard);
//# sourceMappingURL=api-key.guard.js.map