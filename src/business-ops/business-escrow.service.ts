import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { paginate, paginationParams } from '../common/utils/pagination.util';
import { BusinessAccessService } from './business-access.service';
import { BusinessEscrowDto } from './business-ops.dto';

const OPEN = ['created', 'awaiting_payment'];

/**
 * Business escrow is a request layer on top of the existing escrow_contracts.
 * Funding, release, dispute and refund keep using EscrowService unchanged.
 */
@Injectable()
export class BusinessEscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly escrow: EscrowService,
  ) {}

  /** Expire unfunded requests and mirror the state of linked escrow contracts. */
  async sync(where: any) {
    await this.prisma.business_escrows.updateMany({
      where: {
        ...where,
        status: { in: OPEN as any },
        expires_at: { lt: new Date() },
      },
      data: { status: 'expired' },
    });
    const linked = await this.prisma.business_escrows.findMany({
      where: {
        ...where,
        escrow_contract_id: { not: null },
        status: { notIn: ['released', 'expired'] },
      },
      include: { escrow_contract: { select: { status: true } } },
    });
    for (const be of linked) {
      const cs = be.escrow_contract?.status;
      const next =
        cs === 'completed'
          ? 'released'
          : cs === 'disputed'
            ? 'disputed'
            : cs === 'cancelled' || cs === 'refunded'
              ? 'expired'
              : null;
      if (next && next !== be.status)
        await this.prisma.business_escrows.update({
          where: { id: be.id },
          data: { status: next },
        });
    }
  }

  async list(userId: string, q: any) {
    const a = await this.access.resolve(userId, 'escrow:read');
    const where: any = { business_id: a.business.id };
    await this.sync(where);
    if (q.status) where.status = q.status;
    const { skip, take, page, limit } = paginationParams(q.page, q.limit);
    const [items, total] = await Promise.all([
      this.prisma.business_escrows.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.business_escrows.count({ where }),
    ]);
    return {
      data: items.map((e) => this.shape(e)),
      meta: paginate(total, page, limit),
    };
  }

  async get(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'escrow:read');
    await this.sync({ id });
    const e = await this.prisma.business_escrows.findFirst({
      where: { id, business_id: a.business.id },
      include: { escrow_contract: true },
    });
    if (!e) throw new NotFoundException('Escrow not found');
    return { data: this.shape(e) };
  }

  async create(userId: string, dto: BusinessEscrowDto) {
    const a = await this.access.resolve(userId, 'escrow:manage');
    const ident = dto.buyer_identifier.trim();
    const buyer = await this.prisma.users.findFirst({
      where: {
        OR: [{ username: ident }, { phone: ident }],
        is_deleted: false,
        is_active: true,
      },
      select: { id: true },
    });
    if (!buyer) throw new NotFoundException('Buyer not found');
    if (buyer.id === a.business.owner_user_id)
      throw new BadRequestException('Buyer cannot be the business owner');
    if (dto.milestones?.length) {
      const sum =
        Math.round(dto.milestones.reduce((s, m) => s + m.amount, 0) * 100) /
        100;
      if (sum !== Math.round(dto.amount * 100) / 100)
        throw new BadRequestException(
          'Milestone amounts must add up to the escrow amount',
        );
    }
    const expires_at = dto.expires_at ? new Date(dto.expires_at) : null;
    if (expires_at && expires_at <= new Date())
      throw new BadRequestException('Expiry must be in the future');
    const e = await this.prisma.business_escrows.create({
      data: {
        business_id: a.business.id,
        buyer_user_id: buyer.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        amount: dto.amount,
        milestones:
          dto.milestones?.map((m) => ({
            title: m.title.trim(),
            amount: m.amount,
          })) ?? undefined,
        expires_at,
        created_by: userId,
      },
    });
    return { data: this.shape(e), message: 'Escrow created' };
  }

  async send(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'escrow:manage');
    const r = await this.prisma.business_escrows.updateMany({
      where: { id, business_id: a.business.id, status: 'created' },
      data: { status: 'awaiting_payment' },
    });
    if (!r.count)
      throw new BadRequestException('Only newly created escrows can be sent');
    const e = await this.prisma.business_escrows.findUniqueOrThrow({
      where: { id },
    });
    await this.notify(
      e.buyer_user_id,
      'Escrow payment requested',
      `${a.business.trading_name || a.business.legal_name} requested ${Number(e.amount)} FARM in escrow for "${e.title}".`,
    );
    return {
      ...(await this.get(userId, id)),
      message: 'Sent to buyer for payment',
    };
  }

  async start(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'escrow:manage');
    await this.sync({ id });
    const r = await this.prisma.business_escrows.updateMany({
      where: { id, business_id: a.business.id, status: 'funded' },
      data: { status: 'in_progress', started_at: new Date() },
    });
    if (!r.count)
      throw new BadRequestException('Only funded escrows can be started');
    return this.get(userId, id);
  }

  async requestRelease(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'escrow:manage');
    await this.sync({ id });
    const r = await this.prisma.business_escrows.updateMany({
      where: {
        id,
        business_id: a.business.id,
        status: { in: ['funded', 'in_progress'] },
      },
      data: { status: 'release_requested', release_requested_at: new Date() },
    });
    if (!r.count)
      throw new BadRequestException(
        'Release can only be requested on funded escrows',
      );
    const e = await this.prisma.business_escrows.findUniqueOrThrow({
      where: { id },
    });
    await this.notify(
      e.buyer_user_id,
      'Release requested',
      `The seller asked you to release escrow "${e.title}". Review it in Escrow.`,
    );
    return {
      ...(await this.get(userId, id)),
      message: 'Release requested from buyer',
    };
  }

  async cancel(userId: string, id: string) {
    const a = await this.access.resolve(userId, 'escrow:manage');
    const r = await this.prisma.business_escrows.updateMany({
      where: { id, business_id: a.business.id, status: { in: OPEN as any } },
      data: { status: 'expired' },
    });
    if (!r.count)
      throw new BadRequestException('Only unfunded escrows can be withdrawn');
    return this.get(userId, id);
  }

  // ----- buyer side -----
  async incoming(buyerId: string) {
    await this.sync({ buyer_user_id: buyerId });
    const items = await this.prisma.business_escrows.findMany({
      where: { buyer_user_id: buyerId, status: { not: 'created' } },
      include: {
        business: { select: { trading_name: true, legal_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return {
      data: items.map((e) => ({
        ...this.shape(e),
        business_name: e.business.trading_name || e.business.legal_name,
      })),
    };
  }

  async fund(buyerId: string, id: string, pin: string) {
    await this.sync({ id });
    const e = await this.prisma.business_escrows.findUnique({
      where: { id },
      include: { business: true },
    });
    if (!e || e.buyer_user_id !== buyerId)
      throw new NotFoundException('Escrow not found');
    if (e.status !== 'awaiting_payment')
      throw new BadRequestException(`Escrow is ${e.status.replace('_', ' ')}`);
    const owner = await this.prisma.users.findUnique({
      where: { id: e.business.owner_user_id },
      select: { username: true, phone: true },
    });
    const seller = owner?.username || owner?.phone;
    if (!seller)
      throw new ForbiddenException('Seller account is not reachable');
    // Claim first so the same request cannot be funded twice.
    const claimed = await this.prisma.business_escrows.updateMany({
      where: { id, status: 'awaiting_payment' },
      data: { status: 'funded' },
    });
    if (!claimed.count)
      throw new BadRequestException('Escrow is no longer awaiting payment');
    try {
      const res: any = await this.escrow.create(buyerId, {
        seller_identifier: seller,
        amount: Number(e.amount),
        title: e.title,
        description: e.description ?? undefined,
        pin,
      });
      await this.prisma.business_escrows.update({
        where: { id },
        data: { escrow_contract_id: res.data.id },
      });
      return {
        data: {
          escrow_contract_id: res.data.id,
          reference_code: res.data.reference_code,
        },
        message: 'Escrow funded',
      };
    } catch (err) {
      await this.prisma.business_escrows.update({
        where: { id },
        data: { status: 'awaiting_payment' },
      });
      throw err;
    }
  }

  private shape(e: any) {
    return {
      ...e,
      amount: Number(e.amount),
      escrow_contract: e.escrow_contract
        ? {
            id: e.escrow_contract.id,
            reference_code: e.escrow_contract.reference_code,
            status: e.escrow_contract.status,
          }
        : undefined,
    };
  }

  private async notify(userId: string, title: string, body: string) {
    await this.prisma.notifications
      .create({ data: { user_id: userId, type: 'escrow', title, body } as any })
      .catch(() => undefined);
  }
}
