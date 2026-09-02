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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cache_service_1 = require("../common/cache/cache.service");
let ProjectsService = class ProjectsService {
    constructor(prisma, cacheService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
    }
    async findAll() {
        return this.cacheService.wrap('projects:all', 120, async () => {
            const projects = await this.prisma.investment_projects.findMany({
                where: { status: 'active' },
                orderBy: { created_at: 'desc' },
            });
            return {
                data: projects.map((p) => ({
                    ...p,
                    total_value: Number(p.total_value),
                    token_price: Number(p.token_price),
                })),
            };
        });
    }
    async findOne(id) {
        return this.cacheService.wrap(`projects:detail:${id}`, 120, async () => {
            const project = await this.prisma.projects.findUnique({
                where: { id },
            });
            if (!project)
                throw new common_1.NotFoundException('Project not found');
            return {
                data: {
                    ...project,
                    total_value: Number(project.total_value),
                    token_price: Number(project.token_price),
                },
            };
        });
    }
    async create(dto, userId) {
        const project = await this.prisma.projects.create({
            data: {
                ...dto,
                available_tokens: dto.total_value / dto.token_price,
            },
        });
        await this.cacheService.del('projects:all');
        await this.cacheService.del(`projects:detail:${project.id}`);
        return {
            data: project,
            message: 'Project created successfully',
        };
    }
    async invest(userId, dto, ip) {
        const project = await this.prisma.projects.findUnique({
            where: { id: dto.project_id },
        });
        if (!project)
            throw new common_1.NotFoundException('Project not found');
        if (project.status !== 'active') {
            throw new common_1.ForbiddenException('Project is not open for investment');
        }
        const tokens = dto.amount / Number(project.token_price);
        if (tokens > Number(project.available_tokens)) {
            throw new common_1.BadRequestException('Not enough tokens available');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.projects.update({
                where: { id: dto.project_id },
                data: {
                    available_tokens: { decrement: tokens },
                    sold_tokens: { increment: tokens },
                },
            });
            const investment = await tx.project_investments.create({
                data: {
                    user_id: userId,
                    project_id: dto.project_id,
                    amount: dto.amount,
                    tokens_bought: tokens,
                    price_per_token: project.token_price,
                    status: 'completed',
                },
            });
            return {
                data: investment,
                message: 'Investment successful',
            };
        });
        await this.cacheService.del('projects:all');
        await this.cacheService.del(`projects:detail:${dto.project_id}`);
        return result;
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cache_service_1.CacheService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map