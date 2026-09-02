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
var CacheInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const crypto_1 = require("crypto");
const cache_service_1 = require("../cache/cache.service");
let CacheInterceptor = CacheInterceptor_1 = class CacheInterceptor {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(CacheInterceptor_1.name);
    }
    buildCacheKey(req) {
        const authHeader = req.headers.authorization ?? '';
        const authHash = authHeader
            ? (0, crypto_1.createHash)('sha256').update(authHeader).digest('hex')
            : 'anonymous';
        return `http:${req.method}:${req.originalUrl}:${authHash}`;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        if (!['GET', 'HEAD'].includes(req.method)) {
            return next.handle();
        }
        const key = this.buildCacheKey(req);
        return new rxjs_1.Observable((subscriber) => {
            this.cacheService.get(key).then((cached) => {
                if (cached) {
                    res.setHeader('X-Cache', 'HIT');
                    res.status(cached.status);
                    subscriber.next(cached.body);
                    subscriber.complete();
                    return;
                }
                next
                    .handle()
                    .pipe((0, operators_1.tap)((payload) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        void this.cacheService.set(key, { status: res.statusCode, body: payload });
                        res.setHeader('X-Cache', 'MISS');
                    }
                }))
                    .subscribe({
                    next: (value) => subscriber.next(value),
                    error: (err) => subscriber.error(err),
                    complete: () => subscriber.complete(),
                });
            }).catch((error) => {
                this.logger.warn(`Cache lookup failed for key ${key}: ${error}`);
                next.handle().subscribe({
                    next: (value) => subscriber.next(value),
                    error: (err) => subscriber.error(err),
                    complete: () => subscriber.complete(),
                });
            });
        });
    }
};
exports.CacheInterceptor = CacheInterceptor;
exports.CacheInterceptor = CacheInterceptor = CacheInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cache_service_1.CacheService])
], CacheInterceptor);
//# sourceMappingURL=cache.interceptor.js.map