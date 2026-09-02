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
var TurnstileGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnstileGuard = void 0;
const common_1 = require("@nestjs/common");
const turnstile_service_1 = require("../services/turnstile.service");
let TurnstileGuard = TurnstileGuard_1 = class TurnstileGuard {
    constructor(turnstile) {
        this.turnstile = turnstile;
        this.logger = new common_1.Logger(TurnstileGuard_1.name);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const body = request.body || {};
        const ip = request.ip || request.connection?.remoteAddress || undefined;
        const token = body.cf_turnstile_response || body.turnstile_token;
        if (!token) {
            this.logger.warn(`Turnstile token missing from ${request.method} ${request.path} IP=${ip}`);
            throw new common_1.BadRequestException('Turnstile token required');
        }
        try {
            const verification = await this.turnstile.verifyToken(token, ip);
            request.turnstileVerification = verification;
            return true;
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException)
                throw error;
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Turnstile verification error: ${message}`);
            throw new common_1.BadRequestException('Captcha verification failed');
        }
    }
};
exports.TurnstileGuard = TurnstileGuard;
exports.TurnstileGuard = TurnstileGuard = TurnstileGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [turnstile_service_1.TurnstileService])
], TurnstileGuard);
//# sourceMappingURL=turnstile.guard.js.map