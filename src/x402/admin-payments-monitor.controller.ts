import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { PrismaService } from '../database/prisma.service';
import { fromUnits } from './x402-config';

/** Gap fix: read-only admin monitoring for Phase 9 agent payments and Phase 10 x402 payments. */
@ApiTags('Admin - Payments monitor')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/payments-monitor', version: '1' })
export class AdminPaymentsMonitorController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async overview(@Query('kind') kind?: string) {
    const take = 50;
    const counts = async (model: any) =>
      Object.fromEntries(((await model.groupBy({ by: ['status'], _count: { _all: true } })) as any[]).map((g) => [g.status, g._count._all]));
    const [intents, requests, x402] = await Promise.all([
      kind && kind !== 'intents' ? [] : this.prisma.payment_intents.findMany({ orderBy: { created_at: 'desc' }, take }),
      kind && kind !== 'agent_requests' ? [] : this.prisma.agent_payment_requests.findMany({ orderBy: { created_at: 'desc' }, take }),
      kind && kind !== 'x402' ? [] : this.prisma.x402_payments.findMany({ orderBy: { created_at: 'desc' }, take }),
    ]);
    return {
      counts: {
        intents: await counts(this.prisma.payment_intents),
        agent_requests: await counts(this.prisma.agent_payment_requests),
        x402: await counts(this.prisma.x402_payments),
      },
      intents: intents.map((i: any) => ({ id: i.id, business_id: i.business_id, amount: Number(i.amount), status: i.status, live_mode: i.live_mode, created_at: i.created_at })),
      agent_requests: requests.map((r: any) => ({ id: r.id, business_id: r.business_id, user_id: r.user_id, amount: Number(r.amount), status: r.status, failure_reason: r.failure_reason, created_at: r.created_at })),
      x402: x402.map((p: any) => ({ id: p.id, business_id: p.business_id, network: p.network, transaction: p.tx_id, asset: p.asset, amount: fromUnits(BigInt(p.amount_units), p.asset), status: p.status, error: p.error, created_at: p.created_at })),
    };
  }
}
