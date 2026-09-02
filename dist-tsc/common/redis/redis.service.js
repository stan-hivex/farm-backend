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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.client = null;
    }
    async onModuleInit() {
        const redisUrl = this.config.get('REDIS_URL')?.trim() || process.env.REDIS_URL?.trim();
        if (!redisUrl) {
            throw new Error('REDIS_URL is required and must point to an external managed Redis instance');
        }
        await this.initFromUrl(redisUrl);
    }
    async initFromUrl(redisUrl) {
        if (!redisUrl)
            throw new Error('REDIS_URL is required');
        try {
            const url = new URL(redisUrl);
            const isTls = url.protocol === 'rediss:';
            const opts = {
                maxRetriesPerRequest: null,
                enableReadyCheck: true,
                connectTimeout: 10000,
            };
            if (isTls) {
                opts.tls = { servername: url.hostname };
            }
            this.client = new ioredis_1.default(redisUrl, opts);
            this.client.on('error', (err) => {
                this.logger.error(`Redis error: ${err?.message}`);
            });
            this.client.on('connect', () => this.logger.log('Redis connecting...'));
            this.client.on('ready', () => this.logger.log('Redis ready'));
            this.client.on('close', () => this.logger.warn('Redis connection closed'));
            const pong = await this.client.ping();
            if (pong !== 'PONG') {
                throw new Error(`Unexpected PING response from Redis: ${String(pong)}`);
            }
            this.logger.log(`Redis connection established to ${url.hostname} (TLS: ${isTls})`);
        }
        catch (error) {
            this.logger.error('Failed to initialize Redis client', error);
            throw error;
        }
    }
    getClient() {
        return this.client;
    }
    async isHealthy() {
        try {
            if (!this.client)
                return false;
            const r = await this.client.ping();
            return r === 'PONG';
        }
        catch {
            return false;
        }
    }
    async quit() {
        try {
            if (this.client) {
                await this.client.quit();
                this.client = null;
            }
        }
        catch (e) {
            this.logger.warn('Error quitting Redis client', e);
        }
    }
    async onModuleDestroy() {
        await this.quit();
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map