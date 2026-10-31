import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { stripReturns } from '../project-marketplace/project-rules';

/**
 * Legacy (pre-V2) `projects` API. Kept read-only so existing data stays visible.
 * Creating projects and investing moved to the V2 marketplace (business projects
 * reviewed by admins; investing via /v1/marketplace/projects/:id/invest).
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.projects.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return { data: rows.map((p) => this.shape(p)) };
  }

  async findOne(id: string) {
    const p = await this.prisma.projects.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Project not found');
    return { data: this.shape(p) };
  }

  private shape(p: any) {
    return stripReturns({
      ...JSON.parse(JSON.stringify(p)),
      legacy: true,
      investable: false,
    });
  }

  create(_dto: unknown, _userId: string): never {
    throw new GoneException(
      'Projects are now created by verified businesses and reviewed by FARM. Use /v1/business/projects.',
    );
  }

  invest(_userId: string, _dto: unknown, _ip: string): never {
    throw new GoneException(
      'Investing moved to /v1/marketplace/projects/:id/invest (eligibility and risk disclosure required).',
    );
  }
}
