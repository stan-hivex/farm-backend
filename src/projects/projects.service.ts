import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  // GET ALL PROJECTS
  async findAll() {
    return this.cacheService.wrap(
      'projects:all',
      120,
      async () => {
        const projects = await this.prisma.investment_projects.findMany({
          where: { status: 'active' },
          orderBy: { created_at: 'desc' },
        });

        return {
          data: projects.map((p) => ({
            ...p,
            total_value: Number((p as any).total_value),
            token_price: Number((p as any).token_price),
          })),
        };
      },
    );
  }

  // SINGLE PROJECT
  async findOne(id: string) {
    return this.cacheService.wrap(`projects:detail:${id}`, 120, async () => {
      const project = await (this.prisma as any).projects.findUnique({
        where: { id },
      });

      if (!project) throw new NotFoundException('Project not found');

      return {
        data: {
          ...project,
          total_value: Number((project as any).total_value),
          token_price: Number((project as any).token_price),
        },
      };
    });
  }

  // CREATE PROJECT (ADMIN ONLY LATER)
  async create(dto: any, userId: string) {
    const project = await (this.prisma as any).projects.create({
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

  // INVEST INTO PROJECT (FINTECH CORE LOGIC)
  async invest(userId: string, dto: any, ip: string) {
    const project = await (this.prisma as any).projects.findUnique({
      where: { id: dto.project_id },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (project.status !== 'active') {
      throw new ForbiddenException('Project is not open for investment');
    }

    const tokens = dto.amount / Number(project.token_price);

    if (tokens > Number(project.available_tokens)) {
      throw new BadRequestException('Not enough tokens available');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. deduct available tokens
      await (tx as any).projects.update({
        where: { id: dto.project_id },
        data: {
          available_tokens: { decrement: tokens },
          sold_tokens: { increment: tokens },
        },
      });

      // 2. record investment
      const investment = await (tx as any).project_investments.create({
        data: {
          user_id: userId,
          project_id: dto.project_id,
          amount: dto.amount,
          tokens_bought: tokens,
          price_per_token: (project as any).token_price,
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
}