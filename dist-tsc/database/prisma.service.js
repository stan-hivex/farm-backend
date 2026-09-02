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
exports.PrismaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
let PrismaService = class PrismaService extends client_1.PrismaClient {
    constructor() {
        super({
            log: process.env.NODE_ENV === 'development'
                ? ['query', 'warn', 'error']
                : ['error'],
        });
        this.logger = new common_1.Logger('PrismaService');
    }
    async onModuleInit() {
        try {
            if (!process.env.DATABASE_URL) {
                this.logger.warn('⚠️ DATABASE_URL environment variable is not set. Database operations will fail.');
                this.logger.warn('On Render.com: Connect a PostgreSQL database or set DATABASE_URL in environment variables.');
                return;
            }
            await this.$connect();
            this.logger.log('✅ PostgreSQL Connected');
        }
        catch (error) {
            this.logger.error(`❌ Failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`);
            this.logger.error('Make sure DATABASE_URL is set and the database is accessible.');
            this.logger.warn('Application starting in degraded mode. Database operations will fail.');
        }
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }
};
exports.PrismaService = PrismaService;
exports.PrismaService = PrismaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrismaService);
//# sourceMappingURL=prisma.service.js.map