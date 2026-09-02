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
exports.AuditMiddleware = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const AUDITED_PATHS = [
    '/admin',
    '/kyc',
    '/payments',
    '/auth',
    '/security',
    '/users',
    '/transactions',
    '/withdraw',
    '/deposit',
    '/transfer-requests',
    '/settings',
    '/merchant',
    '/escrow',
    '/investments',
    '/wallet',
    '/device-token',
];
let AuditMiddleware = class AuditMiddleware {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger('AuditMiddleware');
    }
    use(req, res, next) {
        const shouldAudit = AUDITED_PATHS.some((p) => req.path.includes(p));
        if (!shouldAudit || req.method === 'GET')
            return next();
        const originalSend = res.send.bind(res);
        res.send = (body) => {
            const user = req.user;
            if (user?.id) {
                this.prisma.audit_logs.create({
                    data: {
                        user_id: user.id,
                        action: `${req.method} ${req.path}`,
                        entity_type: req.path.split('/')[2] ?? 'unknown',
                        ip_address: req.ip ?? null,
                        user_agent: req.headers['user-agent'] ?? null,
                        new_values: {
                            body: this.sanitize(req.body),
                            status: res.statusCode,
                            request_id: req.requestId,
                        },
                    },
                }).catch((e) => this.logger.error('Audit log failed:', e));
            }
            return originalSend(body);
        };
        next();
    }
    sanitize(body) {
        if (!body || typeof body !== 'object')
            return body;
        const REDACTED = ['password', 'pin', 'confirm_pin', 'otp_code', 'refresh_token',
            'access_token', 'private_key', 'mnemonic', 'secret'];
        const clean = { ...body };
        for (const key of REDACTED) {
            if (key in clean)
                clean[key] = '[REDACTED]';
        }
        return clean;
    }
};
exports.AuditMiddleware = AuditMiddleware;
exports.AuditMiddleware = AuditMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditMiddleware);
//# sourceMappingURL=audit.middleware.js.map