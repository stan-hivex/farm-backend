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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TurnstileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnstileService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let TurnstileService = TurnstileService_1 = class TurnstileService {
    constructor(cfg) {
        this.cfg = cfg;
        this.logger = new common_1.Logger(TurnstileService_1.name);
        this.TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    }
    async verifyToken(token, remoteIp) {
        if (!token) {
            throw new common_1.BadRequestException('Turnstile token required');
        }
        const secret = this.cfg.get('TURNSTILE_SECRET_KEY');
        if (!secret) {
            this.logger.error('TURNSTILE_SECRET_KEY not configured');
            throw new Error('Turnstile verification not configured on server');
        }
        try {
            const response = await axios_1.default.post(this.TURNSTILE_VERIFY_URL, {
                secret,
                response: token,
                remoteip: remoteIp,
            }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' },
            });
            const data = response.data;
            if (!data.success) {
                const errors = data['error-codes']?.join(', ') || 'unknown error';
                this.logger.warn(`Turnstile verification failed: ${errors} for IP=${remoteIp}`);
                throw new common_1.BadRequestException(`Captcha validation failed: ${errors}`);
            }
            this.logger.debug(`Turnstile verified for hostname=${data.hostname} challenge_ts=${data.challenge_ts}`);
            return data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                this.logger.error(`Turnstile API error: ${error.message} status=${error.response?.status}`);
                throw new common_1.BadRequestException('Captcha verification service unavailable');
            }
            throw error;
        }
    }
    async verifyWithScore(token, minScore = 0.5, remoteIp) {
        const result = await this.verifyToken(token, remoteIp);
        if (result.score !== undefined && result.score < minScore) {
            this.logger.warn(`Turnstile score too low: ${result.score} < ${minScore}`);
            throw new common_1.BadRequestException('Captcha score too low, possible bot activity');
        }
        return result;
    }
};
exports.TurnstileService = TurnstileService;
exports.TurnstileService = TurnstileService = TurnstileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TurnstileService);
//# sourceMappingURL=turnstile.service.js.map