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
var BullmqService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BullmqService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const redis_service_1 = require("../redis/redis.service");
let BullmqService = BullmqService_1 = class BullmqService {
    constructor(redis) {
        this.redis = redis;
        this.logger = new common_1.Logger(BullmqService_1.name);
        this.queues = new Map();
        this.workers = new Map();
    }
    getRedisConnection(opts) {
        if (opts && 'connection' in opts && opts.connection) {
            return opts.connection;
        }
        const client = this.redis.getClient();
        if (!client) {
            throw new Error('Redis client is not initialized. Ensure REDIS_URL is configured and reachable.');
        }
        return client;
    }
    createQueue(name, opts) {
        const connection = this.getRedisConnection(opts);
        const q = new bullmq_1.Queue(name, { ...opts, connection });
        this.queues.set(name, q);
        this.logger.log(`Created queue ${name}`);
        return q;
    }
    createWorker(name, processor, opts) {
        const connection = this.getRedisConnection(opts);
        const w = new bullmq_1.Worker(name, processor, { ...opts, connection });
        this.workers.set(name, w);
        this.logger.log(`Created worker ${name}`);
        return w;
    }
    getQueue(name) {
        return this.queues.get(name) ?? null;
    }
    async closeAll() {
        for (const [name, w] of this.workers.entries()) {
            try {
                await w.close();
                this.logger.log(`Closed worker ${name}`);
            }
            catch (e) {
                this.logger.warn(`Error closing worker ${name}`, e);
            }
        }
        for (const [name, q] of this.queues.entries()) {
            try {
                await q.close();
                this.logger.log(`Closed queue ${name}`);
            }
            catch (e) {
                this.logger.warn(`Error closing queue ${name}`, e);
            }
        }
    }
    async onModuleDestroy() {
        await this.closeAll();
    }
};
exports.BullmqService = BullmqService;
exports.BullmqService = BullmqService = BullmqService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], BullmqService);
//# sourceMappingURL=bullmq.service.js.map