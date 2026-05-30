import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private escrowService: EscrowService) {}

  async getDashboardStats() {
    const [totalUsers, totalMerchants, activeEscrows, txVolume, pendingKyc, pendingPayouts] =
      await Promise.all([
        this.prisma.users.count({ where: { is_deleted: false } }),
        this.prisma.merchants.count({ where: { status: 'approved' } }),
        this.prisma.escrow_contracts.count({ where: { status: 'active' } }),
        this.prisma.transactions.aggregate({
          where: { status: 'completed' }, _sum: { amount: true }, _count: true,
        }),
        this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
        this.prisma.merchant_payouts.count({ where: { status: 'pending' } }),
      ]);
    return {
      data: {
        total_users: totalUsers,
        total_merchants: totalMerchants,
        active_escrows: activeEscrows,
        total_tx_volume: Number(txVolume._sum.amount ?? 0),
        total_transactions: txVolume._count,
        pending_kyc: pendingKyc,
        pending_payouts: pendingPayouts,
      },
    };
  }

  async listUsers(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = { is_deleted: false };
    if (query.search)
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    if (query.role) where.role = query.role;
    if (query.kyc_status) where.kyc_status = query.kyc_status;

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where, skip, take, orderBy: { created_at: 'desc' },
        select: {
          id: true, first_name: true, last_name: true, username: true,
          email: true, phone: true, role: true, kyc_status: true,
          is_active: true, is_suspended: true, created_at: true,
          wallets: { select: { balance: true }, take: 1 },
        },
      }),
      this.prisma.users.count({ where }),
    ]);
    return {
      data: users.map((u) => ({ ...u, balance: Number(u.wallets[0]?.balance ?? 0) })),
      meta: paginate(total, page, limit),
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        wallets: true,
        // Correct relation names from generated Prisma client
        kyc_documents_kyc_documents_user_idTousers: {
          orderBy: { created_at: 'desc' }, take: 1,
        },
        merchants_merchants_user_idTousers: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return { data: user };
  }

  async updateUserStatus(
    userId: string,
    dto: { is_active?: boolean; is_suspended?: boolean },
    adminId: string,
  ) {
    const user = await this.prisma.users.update({ where: { id: userId }, data: dto });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId, action: 'UPDATE_USER_STATUS',
        entity_type: 'users', entity_id: userId,
        new_values: dto as any,
      },
    });
    return { data: user, message: 'User status updated' };
  }

  async listAllEscrows(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.escrow_contracts.findMany({
        where, skip, take, orderBy: { created_at: 'desc' },
        include: {
          users_escrow_contracts_buyer_idTousers: { select: { username: true } },
          users_escrow_contracts_seller_idTousers: { select: { username: true } },
        },
      }),
      this.prisma.escrow_contracts.count({ where }),
    ]);
    return {
      data: items.map((e) => ({ ...e, amount: Number(e.amount), fee: Number(e.fee) })),
      meta: paginate(total, page, limit),
    };
  }

  async resolveDispute(
    escrowId: string, adminId: string,
    dto: { winner: 'buyer' | 'seller'; note: string },
  ) {
    const escrow = await this.prisma.escrow_contracts.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (dto.winner === 'seller') await this.escrowService.executeRelease(escrow);
    else await this.escrowService.executeRefund(escrow);
    await this.prisma.escrow_contracts.update({
      where: { id: escrowId },
      data: { arbiter_id: adminId, resolution_note: dto.note, resolved_at: new Date() },
    });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId, action: 'RESOLVE_DISPUTE',
        entity_type: 'escrow_contracts', entity_id: escrowId,
        new_values: dto as any,
      },
    });
    return { message: `Escrow resolved in favour of ${dto.winner}` };
  }

  async listMerchants(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.merchants.findMany({
        where, skip, take, orderBy: { created_at: 'desc' },
        include: {
          // Correct relation name: users via user_id FK
          users_merchants_user_idTousers: {
            select: { username: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.merchants.count({ where }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async approveMerchant(
    merchantId: string, adminId: string,
    dto: { status: 'approved' | 'rejected'; rejection_reason?: string },
  ) {
    const merchant = await this.prisma.merchants.update({
      where: { id: merchantId },
      data: { status: dto.status as any, approved_by: adminId, approved_at: new Date() },
    });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId, action: `MERCHANT_${dto.status.toUpperCase()}`,
        entity_type: 'merchants', entity_id: merchantId,
        new_values: dto as any,
      },
    });
    return { data: merchant, message: `Merchant ${dto.status}` };
  }

  async listPayouts(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.merchant_payouts.findMany({
        where, skip, take, orderBy: { created_at: 'desc' },
        include: {
          // Correct relation name for merchant FK
          merchants: { select: { business_name: true } },
        },
      }),
      this.prisma.merchant_payouts.count({ where }),
    ]);
    return {
      data: items.map((p) => ({ ...p, amount: Number(p.amount) })),
      meta: paginate(total, page, limit),
    };
  }

  async processPayout(payoutId: string, adminId: string, status: 'completed' | 'failed') {
    const payout = await this.prisma.merchant_payouts.update({
      where: { id: payoutId },
      data: { status: status as any, processed_by: adminId, processed_at: new Date() },
    });
    return { data: payout, message: `Payout marked ${status}` };
  }

  async getSettings() {
    return {
      data: await this.prisma.system_settings.findMany({ orderBy: { setting_key: 'asc' } }),
    };
  }

  async updateSetting(key: string, value: string, adminId: string) {
    const setting = await this.prisma.system_settings.upsert({
      where: { setting_key: key },
      update: { setting_value: value, updated_by: adminId },
      create: { setting_key: key, setting_value: value, updated_by: adminId },
    });
    return { data: setting, message: 'Setting updated' };
  }

  async getAuditLogs(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.audit_logs.findMany({
        skip, take, orderBy: { created_at: 'desc' },
        include: { users: { select: { username: true } } },
      }),
      this.prisma.audit_logs.count(),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async createProject(adminId: string, dto: any) {
    const project = await this.prisma.investment_projects.create({
      data: { ...dto, created_by: adminId },
    });
    return { data: project, message: 'Investment project created' };
  }

  async updateProject(id: string, dto: any) {
    return {
      data: await this.prisma.investment_projects.update({ where: { id }, data: dto }),
    };
  }

  // ── Audit Dashboard ──────────────────────────────────────────────────────────
  async getAuditDashboard() {
    const [securityEvents, activityLogs, userSessions, auditLogs] = await Promise.all([
      this.prisma.security_events.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { users: { select: { username: true, email: true } } },
      }),
      this.prisma.activity_logs.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
        include: { users: { select: { username: true, phone: true } } },
      }),
      this.prisma.user_sessions.findMany({
        where: { is_revoked: false },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      this.prisma.audit_logs.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { users: { select: { username: true } } },
      }),
    ]);

    const securityEventCounts = await this.prisma.security_events.groupBy({
      by: ['event_type'],
      _count: true,
      orderBy: { _count: { event_type: 'desc' } },
    });

    return {
      data: {
        recent_security_events: securityEvents,
        recent_activities: activityLogs,
        active_sessions: userSessions,
        recent_audit_logs: auditLogs,
        security_event_summary: securityEventCounts,
      },
    };
  }

  async getSecurityEvents(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};

    if (query.severity) where.severity = query.severity;
    if (query.event_type) where.event_type = query.event_type;
    if (query.user_id) where.user_id = query.user_id;

    if (query.start_date || query.end_date) {
      where.created_at = {};
      if (query.start_date) where.created_at.gte = new Date(query.start_date);
      if (query.end_date) where.created_at.lte = new Date(query.end_date);
    }

    const [events, total] = await Promise.all([
      this.prisma.security_events.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: { users: { select: { username: true, email: true, phone: true } } },
      }),
      this.prisma.security_events.count({ where }),
    ]);

    return {
      data: events,
      meta: paginate(total, page, limit),
    };
  }

  async getUserActivityLog(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);

    const [logs, total] = await Promise.all([
      this.prisma.activity_logs.findMany({
        where: { user_id: userId },
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: { users: { select: { username: true, email: true } } },
      }),
      this.prisma.activity_logs.count({ where: { user_id: userId } }),
    ]);

    return {
      data: logs,
      meta: paginate(total, page, limit),
    };
  }

  async getUserSessions(userId: string, query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);

    const [sessions, total] = await Promise.all([
      this.prisma.user_sessions.findMany({
        where: { user_id: userId },
        skip,
        take,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.user_sessions.count({ where: { user_id: userId } }),
    ]);

    return {
      data: sessions.map((s) => ({
        id: s.id,
        device_name: s.device_name,
        device_os: s.device_os,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        is_revoked: s.is_revoked,
        used_at: s.used_at,
        created_at: s.created_at,
        expires_at: s.expires_at,
      })),
      meta: paginate(total, page, limit),
    };
  }

  async getAdminAuditLog(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};

    if (query.action) where.action = query.action;
    if (query.entity_type) where.entity_type = query.entity_type;
    if (query.user_id) where.user_id = query.user_id;

    if (query.start_date || query.end_date) {
      where.created_at = {};
      if (query.start_date) where.created_at.gte = new Date(query.start_date);
      if (query.end_date) where.created_at.lte = new Date(query.end_date);
    }

    const [logs, total] = await Promise.all([
      this.prisma.audit_logs.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: { users: { select: { username: true, email: true } } },
      }),
      this.prisma.audit_logs.count({ where }),
    ]);

    return {
      data: logs,
      meta: paginate(total, page, limit),
    };
  }

  async getSecurityStats() {
    const [totalEvents, criticalEvents, highEvents, failedLogins, tokenThefts, suspendedAccounts] =
      await Promise.all([
        this.prisma.security_events.count(),
        this.prisma.security_events.count({ where: { severity: 'critical' } }),
        this.prisma.security_events.count({ where: { severity: 'high' } }),
        this.prisma.security_events.count({
          where: { event_type: 'FAILED_LOGIN' },
        }),
        this.prisma.security_events.count({
          where: { event_type: 'TOKEN_THEFT_DETECTED' },
        }),
        this.prisma.users.count({ where: { is_suspended: true } }),
      ]);

    return {
      data: {
        total_security_events: totalEvents,
        critical_events: criticalEvents,
        high_severity_events: highEvents,
        failed_login_attempts: failedLogins,
        token_theft_detections: tokenThefts,
        suspended_accounts: suspendedAccounts,
      },
    };
  }

  async getComplianceReport(query: any) {
    const startDate = query.start_date ? new Date(query.start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.end_date ? new Date(query.end_date) : new Date();

    const [
      kycVerified,
      kycPending,
      kycRejected,
      transactionsCompleted,
      transactionsFailed,
      suspiciousActivities,
    ] = await Promise.all([
      this.prisma.users.count({
        where: { kyc_status: 'verified' },
      }),
      this.prisma.kyc_documents.count({
        where: {
          status: 'pending',
          created_at: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.kyc_documents.count({
        where: {
          status: 'rejected',
          created_at: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.transactions.count({
        where: {
          status: 'completed',
          created_at: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.transactions.count({
        where: {
          status: 'failed',
          created_at: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.security_events.count({
        where: {
          severity: 'high',
          created_at: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      data: {
        period: { start_date: startDate, end_date: endDate },
        kyc_status: {
          verified: kycVerified,
          pending: kycPending,
          rejected: kycRejected,
        },
        transactions: {
          completed: transactionsCompleted,
          failed: transactionsFailed,
        },
        suspicious_activities: suspiciousActivities,
      },
    };
  }
}