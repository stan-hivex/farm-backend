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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var IdempotencyMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyMiddleware = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../redis/redis.service");
const uuid_1 = require("uuid");
let IdempotencyMiddleware = IdempotencyMiddleware_1 = class IdempotencyMiddleware {
    constructor(redis) {
        this.redis = redis;
        this.logger = new common_1.Logger(IdempotencyMiddleware_1.name);
    }
    async use(req, res, next) {
        const method = (req.method || '').toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method))
            return next();
        const keyHeader = req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key'];
        if (!keyHeader)
            return next();
        const key = `idempotency:${String(keyHeader)}`;
        const ttl = Number(process.env.IDEMPOTENCY_KEY_TTL_MS || 60000);
        const client = this.redis?.getClient();
        if (!client) {
            this.logger.warn('Idempotency middleware: no Redis client available, proceeding without lock');
            return next();
        }
        const value = (0, uuid_1.v4)();
        try {
            const resSet = await client.set(key, value, 'PX', ttl, 'NX');
            if (resSet !== 'OK') {
                res.status(409).json({ message: 'Duplicate request in progress' });
                return;
            }
        }
        catch (e) {
            this.logger.warn('Failed to acquire idempotency lock', e);
            return next();
        }
        const cleanup = async () => {
            try {
                const current = await client.get(key);
                if (current === value) {
                    await client.del(key);
                }
            }
            catch (e) {
                this.logger.debug('Failed to release idempotency lock', e);
            }
        };
        res.on('finish', cleanup);
        res.on('close', cleanup);
        return next();
    }
};
exports.IdempotencyMiddleware = IdempotencyMiddleware;
exports.IdempotencyMiddleware = IdempotencyMiddleware = IdempotencyMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], IdempotencyMiddleware);
//# sourceMappingURL=idempotency.middleware.js.map