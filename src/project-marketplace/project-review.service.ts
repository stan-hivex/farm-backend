import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { generateTxReference } from '../common/utils/reference.util';
import { paginate, paginationParams } from '../common/utils/pagination.util';
import { ADMIN_TRANSITIONS } from './project-rules';
import { presentProject } from './marketplace.service';

/** Admin-only project review. Nothing here runs automatically. */
@Injectable()
export class ProjectReviewService {
  private readonly logger = new Logger(ProjectReviewService.name);
  constructor(private readonly prisma: PrismaService) {}

  async list(q: { status?: string; page?: any; limit?: any }) {
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = q.status
      ? { status: q.status }
      : { business_id: { not: null } };
    const [rows, total] = await Promise.all([
      this.prisma.investment_projects.findMany({
        where,
        skip,
        take,
        orderBy: [{ submitted_at: 'desc' }, { created_at: 'desc' }],
        include: {
          business: {
            select: { legal_name: true, trading_name: true, status: true },
          },
        },
      }),
      this.prisma.investment_projects.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        ...presentProject(r),
        business: r.business,
        review_notes: r.review_notes,
      })),
      meta: paginate(total, page, limit),
    };
  }

  async get(id: string) {
    const p = await this.prisma.investment_projects.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            legal_name: true,
            trading_name: true,
            status: true,
          },
        },
        documents: true,
        reviews: { orderBy: { created_at: 'desc' } },
      },
    });
    if (!p) throw new NotFoundException('Project not found');
    return {
      data: {
        ...presentProject(p),
        business: p.business,
        documents: p.documents,
        reviews: p.reviews,
        review_notes: p.review_notes,
      },
    };
  }

  async transition(
    adminId: string,
    id: string,
    action: string,
    notes?: string,
  ) {
    const rule = ADMIN_TRANSITIONS[action];
    if (!rule) throw new BadRequestException('Unknown action');
    if (['request_info', 'reject'].includes(action) && !notes?.trim())
      throw new BadRequestException('Notes are required for this action');
    const p = await this.prisma.investment_projects.findUnique({
      where: { id },
      include: { business: { select: { status: true } } },
    });
    if (!p) throw new NotFoundException('Project not found');
    if (!rule.from.includes(p.status ?? ''))
      throw new BadRequestException(
        `Cannot ${action} a project in status ${p.status}`,
      );
    if (
      ['approve', 'list'].includes(action) &&
      p.business_id &&
      p.business?.status !== 'approved'
    )
      throw new BadRequestException(
        'The business must pass KYB before its project can be approved or listed',
      );
    const now = new Date();
    const data: any = {
      status: rule.to,
      reviewed_by: adminId,
      review_notes: notes?.trim() || p.review_notes,
    };
    if (action === 'approve') data.approved_at = now;
    if (action === 'list') data.listed_at = now;
    const r = await this.prisma.investment_projects.updateMany({
      where: { id, status: p.status },
      data,
    });
    if (!r.count)
      throw new BadRequestException('Project changed, refresh and try again');
    await this.prisma.project_reviews.create({
      data: {
        project_id: id,
        actor_id: adminId,
        action,
        from_status: p.status,
        to_status: rule.to,
        notes: notes?.trim() || null,
        snapshot: JSON.parse(JSON.stringify(presentProject(p))),
      },
    });
    let refunds: { refunded: number } | null = null;
    if (action === 'cancel') refunds = await this.refundAll(adminId, id);
    return { data: { id, status: rule.to, refunds } };
  }

  /** Cancelled project: return each committed investment to the investor (atomic per row). */
  private async refundAll(adminId: string, projectId: string) {
    const rows = await this.prisma.user_investments.findMany({
      where: { project_id: projectId, status: 'committed' },
    });
    let done = 0;
    for (const inv of rows) {
      await this.prisma.$transaction(async (tx) => {
        const amt = inv.amount ?? 0;
        const claim = await tx.user_investments.updateMany({
          where: { id: inv.id, status: 'committed' },
          data: { status: 'refunded' },
        });
        if (!claim.count) return;
        const w = await tx.wallets.findFirst({
          where: { user_id: inv.user_id!, is_active: true },
        });
        if (!w)
          throw new BadRequestException(
            `Investor wallet missing for ${inv.id}`,
          );
        await tx.wallets.update({
          where: { id: w.id },
          data: { balance: { increment: amt } },
        });
        const t = await tx.transactions.create({
          data: {
            transaction_reference: generateTxReference(),
            receiver_wallet_id: w.id,
            transaction_type: 'investment_refund',
            status: 'completed',
            amount: amt,
            fee: 0,
            net_amount: amt,
            description: 'Investment refund (project cancelled)',
            metadata: {
              investment_id: inv.id,
              project_id: projectId,
              by: adminId,
            },
            processed_at: new Date(),
          },
        });
        await tx.ledger_entries.create({
          data: {
            transaction_id: t.id,
            wallet_id: w.id,
            entry_type: 'credit',
            amount: amt,
            description: 'Investment refund',
          },
        });
        done++;
      });
    }
    return { refunded: done };
  }

  /**
   * Release funds held for a funded/closed project to the business owner's wallet.
   * Explicit admin action only (settlement terms are an open question).
   */
  async settle(adminId: string, projectId: string) {
    const p = await this.prisma.investment_projects.findUnique({
      where: { id: projectId },
      include: { business: { select: { owner_user_id: true } } },
    });
    if (!p) throw new NotFoundException('Project not found');
    if (!['funded', 'closed'].includes(p.status ?? ''))
      throw new BadRequestException(
        'Only funded or closed projects can be settled',
      );
    if (!p.business?.owner_user_id)
      throw new BadRequestException('Legacy projects cannot be settled here');
    const w = await this.prisma.wallets.findFirst({
      where: { user_id: p.business.owner_user_id, is_active: true },
    });
    if (!w) throw new BadRequestException('Business owner wallet not found');
    const rows = await this.prisma.user_investments.findMany({
      where: { project_id: projectId, status: 'committed' },
    });
    let total = 0;
    for (const inv of rows) {
      await this.prisma.$transaction(async (tx) => {
        const amt = inv.amount ?? 0;
        const claim = await tx.user_investments.updateMany({
          where: { id: inv.id, status: 'committed' },
          data: { status: 'active' },
        });
        if (!claim.count) return;
        await tx.wallets.update({
          where: { id: w.id },
          data: { balance: { increment: amt } },
        });
        const t = await tx.transactions.create({
          data: {
            transaction_reference: generateTxReference(),
            receiver_wallet_id: w.id,
            transaction_type: 'investment_settlement',
            status: 'completed',
            amount: amt,
            fee: 0,
            net_amount: amt,
            description: `Investment settlement: ${p.project_name}`,
            metadata: {
              investment_id: inv.id,
              project_id: projectId,
              by: adminId,
            },
            processed_at: new Date(),
          },
        });
        await tx.ledger_entries.create({
          data: {
            transaction_id: t.id,
            wallet_id: w.id,
            entry_type: 'credit',
            amount: amt,
            description: `Settlement ${p.project_name}`,
          },
        });
        total += Number(amt);
      });
    }
    await this.prisma.project_reviews.create({
      data: {
        project_id: projectId,
        actor_id: adminId,
        action: 'settle',
        from_status: p.status,
        to_status: p.status ?? 'closed',
        notes: `Settled ${total}`,
      },
    });
    return { data: { settled_amount: total, investments: rows.length } };
  }

  // ---------------- Investor eligibility ----------------

  async listInvestors(q: { status?: string; page?: any; limit?: any }) {
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const where: any = q.status ? { eligibility_status: q.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.investor_profiles.findMany({
        where,
        skip,
        take,
        orderBy: { updated_at: 'desc' },
      }),
      this.prisma.investor_profiles.count({ where }),
    ]);
    return { data: rows, meta: paginate(total, page, limit) };
  }

  async setEligibility(
    adminId: string,
    userId: string,
    dto: { status: string; category?: string; notes?: string },
  ) {
    if (!['pending', 'eligible', 'restricted'].includes(dto.status))
      throw new BadRequestException('Unknown status');
    if (
      dto.category &&
      !['retail', 'sophisticated', 'institutional'].includes(dto.category)
    )
      throw new BadRequestException('Unknown category');
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const data = {
      eligibility_status: dto.status,
      category: dto.category ?? null,
      notes: dto.notes ?? null,
      reviewed_by: adminId,
      reviewed_at: new Date(),
    };
    const r = await this.prisma.investor_profiles.upsert({
      where: { user_id: userId },
      update: data,
      create: { user_id: userId, ...data },
    });
    return { data: r };
  }
}
