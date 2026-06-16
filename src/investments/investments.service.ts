import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { generateTxReference } from '../common/utils/reference.util';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class InvestmentsService {
  constructor(private prisma: PrismaService, private authService: AuthService) {}

  async listProjects(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = query.status ? { status: query.status } : { status: 'open' };
    if (query.category) where.category = { contains: query.category, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.investment_projects.findMany({
        where, skip, take, orderBy: { created_at: 'desc' },
      }),
      this.prisma.investment_projects.count({ where }),
    ]);
    return {
      data: items.map((p) => ({
        ...p,
        target_amount: Number(p.target_amount),
        raised_amount: Number(p.raised_amount),
        minimum_investment: Number(p.minimum_investment),
        roi_percent: Number(p.roi_percent),
      })),
      meta: paginate(total, page, limit),
    };
  }

  async getProject(id: string) {
    const project = await this.prisma.investment_projects.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Investment project not found');
    const progress =
      Number(project.target_amount) > 0
        ? (Number(project.raised_amount) / Number(project.target_amount)) * 100
        : 0;
    return {
      data: {
        ...project,
        target_amount: Number(project.target_amount),
        raised_amount: Number(project.raised_amount),
        minimum_investment: Number(project.minimum_investment),
        roi_percent: Number(project.roi_percent),
        funding_progress: Math.min(100, progress),
      },
    };
  }

  async invest(userId: string, projectId: string, dto: { amount: number; pin: string }) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    await this.authService.verifyPin(userId, dto.pin);

    const project = await this.prisma.investment_projects.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.status !== 'open') throw new BadRequestException('Project is not open for investment');
    if (project.ends_at && new Date() > project.ends_at)
      throw new BadRequestException('Investment period has ended');
    if (project.minimum_investment && dto.amount < Number(project.minimum_investment))
      throw new BadRequestException(`Minimum investment is ${project.minimum_investment} FARM`);

    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const available = Number(wallet.balance) - Number(wallet.locked_balance);
    if (available < dto.amount)
      throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);

    const expectedRoi = dto.amount * (Number(project.roi_percent) / 100);
    const maturityDate = new Date();
    maturityDate.setMonth(maturityDate.getMonth() + (project.duration_months || 12));

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id }, data: { balance: { decrement: dto.amount } },
      });
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          sender_wallet_id: wallet.id,
          transaction_type: 'investment',
          status: 'completed',
          amount: dto.amount, fee: 0, net_amount: dto.amount,
          description: `Investment: ${project.project_name}`,
          metadata: { user_id: userId },
          processed_at: new Date(),
        },
      });
      const investment = await tx.user_investments.create({
        data: {
          user_id: userId, project_id: projectId, amount: dto.amount,
          expected_roi: expectedRoi, transaction_id: txn.id,
          status: 'active', maturity_date: maturityDate,
        },
      });
      await tx.investment_projects.update({
        where: { id: projectId },
        data: { raised_amount: { increment: dto.amount }, total_backers: { increment: 1 } },
      });
      await tx.ledger_entries.create({
        data: {
          transaction_id: txn.id, wallet_id: wallet.id,
          entry_type: 'debit', amount: dto.amount,
          description: `Investment in ${project.project_name}`,
        },
      });
      return investment;
    });

    return {
      data: { ...result, amount: Number(result.amount), expected_roi: Number(result.expected_roi) },
      message: 'Investment successful',
    };
  }

  async getMyInvestments(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.user_investments.findMany({
        where: { user_id: userId }, skip, take,
        orderBy: { invested_at: 'desc' },
        include: {
          investment_projects: {
            select: { project_name: true, roi_percent: true, status: true },
          },
        },
      }),
      this.prisma.user_investments.count({ where: { user_id: userId } }),
    ]);
    const totalInvested = items.reduce((s, i) => s + Number(i.amount), 0);
    return {
      data: items.map((i) => ({
        ...i,
        amount: Number(i.amount),
        expected_roi: Number(i.expected_roi),
      })),
      meta: { ...paginate(total, page, limit), total_invested: totalInvested },
    };
  }
}