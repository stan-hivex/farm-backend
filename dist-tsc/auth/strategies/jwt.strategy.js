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
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../database/prisma.service");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'jwt') {
    constructor(cfg, prisma) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: cfg.get('JWT_ACCESS_SECRET') || 'secret',
            passReqToCallback: true,
        });
        this.cfg = cfg;
        this.prisma = prisma;
    }
    async validate(req, payload) {
        const user = await this.prisma.users.findUnique({
            where: { id: payload.sub },
            select: { id: true, role: true, is_active: true, is_suspended: true, is_deleted: true },
        });
        if (!user || !user.is_active || user.is_suspended || user.is_deleted)
            throw new common_1.UnauthorizedException('Account unavailable');
        if (payload.jti) {
            const session = await this.prisma.user_sessions.findFirst({
                where: {
                    jwt_id: payload.jti,
                    user_id: payload.sub,
                    OR: [
                        { is_revoked: false },
                        { is_revoked: null },
                    ],
                },
            });
            if (!session) {
                await this.prisma.security_events.create({
                    data: {
                        user_id: payload.sub,
                        event_type: 'REVOKED_TOKEN_USED',
                        description: `Attempted use of revoked JWT token (JTI: ${payload.jti}) from IP ${req.ip || 'unknown'} UA: ${req.headers['user-agent'] || 'unknown'}`,
                        severity: 'high',
                    },
                });
                throw new common_1.UnauthorizedException('Token has been revoked');
            }
        }
        return { id: user.id, role: user.role, wallet_id: payload.wallet_id, jti: payload.jti };
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService, prisma_service_1.PrismaService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map