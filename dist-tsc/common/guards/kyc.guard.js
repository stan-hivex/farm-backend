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
var KycGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KycGuard = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let KycGuard = KycGuard_1 = class KycGuard {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(KycGuard_1.name);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user?.id)
            throw new common_1.UnauthorizedException('Authentication required');
        const userId = user.id;
        const dbUser = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { kyc_status: true, kyc_level: true },
        });
        if (!dbUser)
            throw new common_1.UnauthorizedException('User not found');
        const requestPath = request.path ?? request.url ?? request.originalUrl ?? '';
        const isWithdrawCreate = request.method === 'POST' && requestPath.includes('/withdraw/create');
        const hasLevel2 = Number(dbUser.kyc_level || 0) >= 2;
        if (dbUser.kyc_status === 'verified') {
            this.logger.debug(`KYC passed for user=${userId} status=verified level=${dbUser.kyc_level}`);
            return true;
        }
        if (isWithdrawCreate && hasLevel2) {
            this.logger.debug(`KYC withdraw create passed for user=${userId} path=${requestPath} level=${dbUser.kyc_level}`);
            return true;
        }
        const approvedPartial = dbUser.kyc_status === 'additional_info_required' && hasLevel2;
        if (approvedPartial) {
            this.logger.debug(`KYC passed for additional info required user=${userId} level=${dbUser.kyc_level}`);
            return true;
        }
        this.logger.warn(`KYC denied for user=${userId} status=${dbUser.kyc_status} level=${dbUser.kyc_level} path=${requestPath}`);
        throw new common_1.ForbiddenException('KYC approval required to perform this action');
    }
};
exports.KycGuard = KycGuard;
exports.KycGuard = KycGuard = KycGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], KycGuard);
//# sourceMappingURL=kyc.guard.js.map