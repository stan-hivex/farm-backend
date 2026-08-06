import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { enrichAdminListItem } from './admin-response-utils';
import { PrismaService } from '../database/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WithdrawService } from '../withdraw/withdraw.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';
import { CacheService } from '../common/cache/cache.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(
    private prisma: PrismaService,
    private escrowService: EscrowService,
    private notifications: NotificationsService,
    private withdrawService: WithdrawService,
    private cache: CacheService,
  ) {}

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

  async listTransactions(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.transaction_type) where.transaction_type = query.transaction_type;
    if (query.search) {
      where.OR = [
        { transaction_reference: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.transactions.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          wallets_transactions_sender_wallet_idTowallets: {
            select: { wallet_address: true, user_id: true },
          },
          wallets_transactions_receiver_wallet_idTowallets: {
            select: { wallet_address: true, user_id: true },
          },
        },
      }),
      this.prisma.transactions.count({ where }),
    ]);

    const userIds = [...new Set(items.flatMap((tx) => {
      const senderUserId = tx.wallets_transactions_sender_wallet_idTowallets?.user_id;
      const receiverUserId = tx.wallets_transactions_receiver_wallet_idTowallets?.user_id;
      return [senderUserId, receiverUserId].filter(Boolean) as string[];
    }))];

    const users = userIds.length
      ? await this.prisma.users.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: items.map((tx) => {
        const senderUser = tx.wallets_transactions_sender_wallet_idTowallets?.user_id
          ? userMap.get(tx.wallets_transactions_sender_wallet_idTowallets.user_id)
          : null;
        const receiverUser = tx.wallets_transactions_receiver_wallet_idTowallets?.user_id
          ? userMap.get(tx.wallets_transactions_receiver_wallet_idTowallets.user_id)
          : null;
        const payload = {
          id: tx.id,
          transaction_reference: tx.transaction_reference,
          transaction_type: tx.transaction_type,
          status: tx.status,
          amount: Number(tx.amount),
          fee: Number(tx.fee ?? 0),
          net_amount: Number(tx.net_amount ?? 0),
          currency: tx.currency,
          description: tx.description,
          created_at: tx.created_at,
          processed_at: tx.processed_at,
          sender_wallet: tx.wallets_transactions_sender_wallet_idTowallets?.wallet_address,
          receiver_wallet: tx.wallets_transactions_receiver_wallet_idTowallets?.wallet_address,
          metadata: tx.metadata ?? {},
          user_id: senderUser?.id ?? receiverUser?.id ?? null,
          username: senderUser?.username ?? receiverUser?.username ?? null,
          method: (() => {
            if (typeof tx.metadata === 'object' && tx.metadata !== null) {
              const metadata = tx.metadata as Record<string, any>;
              return metadata.payment_method ?? metadata.method ?? null;
            }
            return null;
          })(),
        };
        return enrichAdminListItem(payload, senderUser ?? receiverUser ?? null);
      }),
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
          users_escrow_contracts_buyer_idTousers: {
            select: { id: true, username: true, first_name: true, last_name: true },
          },
          users_escrow_contracts_seller_idTousers: {
            select: { id: true, username: true, first_name: true, last_name: true },
          },
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

  async getEscrow(escrowId: string) {
    const escrow = await this.prisma.escrow_contracts.findUnique({
      where: { id: escrowId },
      include: {
        users_escrow_contracts_buyer_idTousers: { select: { id: true, username: true, email: true } },
        users_escrow_contracts_seller_idTousers: { select: { id: true, username: true, email: true } },
        escrow_messages: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    return { data: { ...escrow, amount: Number(escrow.amount), fee: Number(escrow.fee ?? 0) } };
  }

  async listFees() {
    const rows = await this.prisma.fee_configurations.findMany({ orderBy: { transaction_type: 'asc' } });
    const items = rows.map((r) => ({
      id: r.id,
      fee_code: r.transaction_type ?? r.id,
      name: r.transaction_type ?? r.id,
      description: null,
      percentage_fee: r.percentage_fee != null ? Number(r.percentage_fee) : null,
      flat_fee: r.flat_fee != null ? Number(r.flat_fee) : null,
      is_active: r.is_active,
      value: r.percentage_fee != null ? `${Number(r.percentage_fee)}` : (r.flat_fee != null ? `${Number(r.flat_fee)}` : ''),
    }));
    return { data: items };
  }

  async updateFee(feeId: string, value: string, adminId: string) {
    const fee = await this.prisma.fee_configurations.findUnique({ where: { id: feeId } });
    if (!fee) throw new NotFoundException('Fee configuration not found');

    const isPercent = value.trim().endsWith('%');
    let updateData: any = {};
    if (isPercent) {
      const num = parseFloat(value.replace('%', '').trim());
      if (Number.isNaN(num)) throw new BadRequestException('Invalid percentage value');
      updateData.percentage_fee = num;
    } else {
      const num = parseFloat(value.trim());
      if (Number.isNaN(num)) throw new BadRequestException('Invalid fee value');
      updateData.flat_fee = num;
    }

    const updated = await this.prisma.fee_configurations.update({ where: { id: feeId }, data: updateData });
    await this.prisma.audit_logs.create({ data: { user_id: adminId, action: 'UPDATE_FEE', entity_type: 'fee_configurations', entity_id: feeId, new_values: updateData as any } });
    return { data: { id: updated.id, value: isPercent ? `${updated.percentage_fee}` : `${updated.flat_fee}` }, message: 'Fee updated' };
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

  async getMerchant(merchantId: string) {
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: merchantId },
      include: {
        users_merchants_user_idTousers: true,
      },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return { data: merchant };
  }

  async getKycDocument(kycDocId: string) {
    const doc = await this.prisma.kyc_documents.findUnique({
      where: { id: kycDocId },
      include: { users_kyc_documents_user_idTousers: true },
    });
    if (!doc) throw new NotFoundException('KYC document not found');
    return { data: doc };
  }

  async approveMerchant(
    merchantId: string, adminId: string,
    dto: { status: 'approved' | 'rejected'; rejection_reason?: string },
  ) {
    const merchant = await this.prisma.merchants.update({
      where: { id: merchantId },
      data: { status: dto.status as any, approved_by: adminId, approved_at: new Date() },
      include: { users_merchants_user_idTousers: true },
    });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId, action: `MERCHANT_${dto.status.toUpperCase()}`,
        entity_type: 'merchants', entity_id: merchantId,
        new_values: dto as any,
      },
    });
    // Notify merchant owner of decision
    try {
      const ownerId = merchant.users_merchants_user_idTousers?.id ?? merchant.user_id;
      if (ownerId) {
        const title = dto.status === 'approved' ? 'Merchant Application Approved' : 'Merchant Application Rejected';
        const body = dto.status === 'approved'
          ? `Your merchant application for "${merchant.business_name ?? 'your business'}" has been approved.`
          : `Your merchant application for "${merchant.business_name ?? 'your business'}" was rejected.${dto.rejection_reason ? ' Reason: ' + dto.rejection_reason : ''}`;
        await this.notifications.sendNotification(ownerId, { type: 'merchant', title, body, entityId: merchantId, metadata: { status: dto.status, merchantId } });
      }
    } catch (e) {
      // Non-fatal: log and continue
      this.logger?.error?.(`Failed to send merchant decision notification: ${e}`);
    }

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

  async listAllWithdrawals(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const where: any = {};
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.withdrawal.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.withdrawal.count({ where }),
    ]);

    const userIds = [...new Set(items.map((w) => w.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: items.map((w) => {
        const user = w.userId ? userMap.get(w.userId) : null;
        return enrichAdminListItem(
          {
            id: w.id,
            transaction_reference: w.reference,
            transaction_type: 'withdrawal',
            status: w.status,
            amount: Number(w.amount),
            created_at: w.createdAt,
            processed_at: w.updatedAt,
            metadata: {
              method: w.method,
              provider: w.method == 'CRYPTO' ? 'ivorypay' : 'paystack',
              destination: w.bankName ?? w.phoneNumber ?? w.cryptoAddress ?? null,
              account_name: w.accountName,
              account_number: w.accountNumber,
              bank_name: w.bankName,
              phone_number: w.phoneNumber,
              crypto_address: w.cryptoAddress,
              crypto_asset: w.cryptoAsset,
              network: w.network,
              user_id: w.userId,
            },
            user_id: w.userId,
            username: user?.username ?? null,
            method: w.method,
          },
          user,
        );
      }),
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

  async sendNotification(adminId: string, dto: {
    user_id: string;
    title: string;
    body: string;
    type?: string;
    metadata?: any;
    push?: boolean;
    email?: boolean;
    sms?: boolean;
  }) {
    const user = await this.prisma.users.findUnique({ where: { id: dto.user_id } });
    if (!user) throw new NotFoundException('User not found');

    await this.notifications.createInApp(dto.user_id, {
      type: dto.type ?? 'admin',
      title: dto.title,
      body: dto.body,
      metadata: dto.metadata,
    });

    if (dto.push) {
      await this.notifications.sendPush(dto.user_id, dto.title, dto.body, dto.metadata);
    }
    if (dto.email && user.email) {
      await this.notifications.sendEmail(user.email, dto.title, `<p>${dto.body}</p>`);
    }
    if (dto.sms && user.phone) {
      await this.notifications.sendSms(user.phone, dto.body);
    }

    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'SEND_NOTIFICATION',
        entity_type: 'users',
        entity_id: dto.user_id,
        new_values: { title: dto.title, body: dto.body, type: dto.type, push: dto.push, email: dto.email, sms: dto.sms },
      },
    });

    return { message: 'Notification sent' };
  }

  async broadcastNotification(adminId: string, dto: {
    title: string;
    body: string;
    type?: string;
    metadata?: any;
    push?: boolean;
    email?: boolean;
    sms?: boolean;
    audience?: string;
    target_role?: string;
    recipientIds?: string[];
    recipientEmails?: string[];
    recipientPhones?: string[];
  }) {
    const where: any = { is_deleted: false, is_active: true };
    const audience = dto.audience?.trim().toLowerCase() || dto.target_role?.trim().toLowerCase();

    if (dto.recipientIds?.length || dto.recipientEmails?.length || dto.recipientPhones?.length) {
      where.OR = [];
      if (dto.recipientIds?.length) {
        where.OR.push({ id: { in: dto.recipientIds } });
      }
      if (dto.recipientEmails?.length) {
        where.OR.push({ email: { in: dto.recipientEmails } });
      }
      if (dto.recipientPhones?.length) {
        where.OR.push({ phone: { in: dto.recipientPhones } });
      }
    } else if (audience === 'verified') {
      where.kyc_status = 'verified';
    } else if (audience === 'merchants') {
      where.role = 'merchant';
    } else if (audience === 'investors') {
      where.role = 'user';
    } else if (audience && audience !== 'all') {
      where.role = audience;
    }

    const users = await this.prisma.users.findMany({ where, select: { id: true, email: true, phone: true } });

    const shouldPush = dto.push ?? true;
    const shouldEmail = dto.email ?? false;
    const shouldSms = dto.sms ?? false;

    await Promise.all(users.map((user) =>
      this.notifications.sendNotification(user.id, {
        type: dto.type ?? 'system_announcement',
        title: dto.title,
        body: dto.body,
        metadata: {
          ...(dto.metadata ?? {}),
          audience: audience || 'custom',
          sentBy: adminId,
        },
      }),
    ));

    if (shouldPush) {
      await Promise.all(users.map((user) => this.notifications.sendPush(user.id, dto.title, dto.body, { ...(dto.metadata ?? {}), audience: audience || 'custom', sentBy: adminId })));
    }
    if (shouldEmail) {
      await Promise.all(users.filter((u) => u.email).map((user) => this.notifications.sendEmail(user.email!, dto.title, `<p>${dto.body}</p>`)));
    }
    if (shouldSms) {
      await Promise.all(users.filter((u) => u.phone).map((user) => this.notifications.sendSms(user.phone!, dto.body)));
    }

    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'BROADCAST_NOTIFICATION',
        entity_type: 'users',
        entity_id: null,
        new_values: { title: dto.title, body: dto.body, type: dto.type, push: shouldPush, email: shouldEmail, sms: shouldSms, audience: audience || 'custom', target_role: dto.target_role, recipientIds: dto.recipientIds, recipientEmails: dto.recipientEmails, recipientPhones: dto.recipientPhones },
      },
    });

    return { message: `Broadcast sent to ${users.length} users` };
  }

  async getAdminAnalytics() {
    const [totalUsers, totalEscrows, totalTransactions, pendingKyc, pendingPayouts, totalSecurityEvents] =
      await Promise.all([
        this.prisma.users.count({ where: { is_deleted: false } }),
        this.prisma.escrow_contracts.count({ where: {} }),
        this.prisma.transactions.count({ where: {} }),
        this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
        this.prisma.merchant_payouts.count({ where: { status: 'pending' } }),
        this.prisma.security_events.count(),
      ]);

    const recentTransactions = await this.prisma.transactions.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        transaction_reference: true,
        transaction_type: true,
        amount: true,
        net_amount: true,
        status: true,
        created_at: true,
      },
    });

    return {
      data: {
        total_users: totalUsers,
        total_escrows: totalEscrows,
        total_transactions: totalTransactions,
        pending_kyc: pendingKyc,
        pending_payouts: pendingPayouts,
        security_events: totalSecurityEvents,
        recent_transactions: recentTransactions.map((tx) => ({
          ...tx,
          amount: Number(tx.amount),
          net_amount: Number(tx.net_amount ?? 0),
        })),
      },
    };
  }

  async getSettings() {
    const cacheKey = 'app-settings:all';
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const payload = {
      data: await this.prisma.system_settings.findMany({ orderBy: { setting_key: 'asc' } }),
    };
    await this.cache.cacheSet(cacheKey, payload, 300);
    return payload;
  }

  async getExchangeRates() {
    const cacheKey = 'exchange-rates:all';
    const cached = await this.cache.cacheGet<any>(cacheKey);
    if (cached) return cached;

    const rates = await this.prisma.exchange_rates.findMany({
      orderBy: [{ base_currency: 'asc' }, { target_currency: 'asc' }],
    });
    const payload = { data: rates };
    await this.cache.cacheSet(cacheKey, payload, 300);
    return payload;
  }

  async updateExchangeRates(rates: { base_currency: string; target_currency: string; rate: number }[], adminId: string): Promise<{ data: any[]; message: string }> {
    const upserted = [] as any[];
    for (const rate of rates) {
      const base = rate.base_currency.toUpperCase();
      const target = rate.target_currency.toUpperCase();
      const existing = await this.prisma.exchange_rates.findFirst({
        where: { base_currency: base, target_currency: target },
        orderBy: { fetched_at: 'desc' },
      });
      if (existing) {
        const entry = await this.prisma.exchange_rates.update({
          where: { id: existing.id },
          data: { rate: rate.rate, fetched_at: new Date() },
        });
        upserted.push(entry as any);
      } else {
        const entry = await this.prisma.exchange_rates.create({
          data: {
            base_currency: base,
            target_currency: target,
            rate: rate.rate,
            fetched_at: new Date(),
          },
        });
        upserted.push(entry as any);
      }
    }
    await Promise.all([
      this.cache.cacheDelete('exchange-rates:all'),
      this.cache.cacheInvalidatePattern('exchange-rate:*'),
    ]);
    return { data: upserted, message: 'Exchange rates updated' };
  }

  async updateSetting(key: string, value: string, adminId: string) {
    const setting = await this.prisma.system_settings.upsert({
      where: { setting_key: key },
      update: { setting_value: value, updated_by: adminId },
      create: { setting_key: key, setting_value: value, updated_by: adminId },
    });
    await Promise.all([
      this.cache.cacheDelete('app-settings:all'),
      this.cache.cacheInvalidatePattern('system-settings:*'),
    ]);
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

  async listKycQueue(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.kyc_documents.findMany({
        where: { status: 'pending' },
        skip,
        take,
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          user_id: true,
          document_type: true,
          document_number: true,
          first_name: true,
          last_name: true,
          status: true,
          created_at: true,
          front_image_url: true,
          back_image_url: true,
          selfie_image_url: true,
          users_kyc_documents_user_idTousers: {
            select: { id: true, username: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
    ]);
    return {
      data: items.map((d) => ({
        id: d.id,
        user_id: d.user_id,
        username: d.users_kyc_documents_user_idTousers?.username,
        email: d.users_kyc_documents_user_idTousers?.email,
        phone: d.users_kyc_documents_user_idTousers?.phone,
        first_name: d.first_name,
        last_name: d.last_name,
        document_type: d.document_type,
        document_number: d.document_number,
        status: d.status,
        created_at: d.created_at,
        front_image_url: d.front_image_url,
        back_image_url: d.back_image_url,
        selfie_image_url: d.selfie_image_url,
      })),
      meta: paginate(total, page, limit),
    };
  }

  async reviewKyc(
    kycDocId: string,
    adminId: string,
    dto: { status: 'verified' | 'rejected' | 'under_review' | 'additional_info_required'; rejection_reason?: string },
  ) {
    const doc = await this.prisma.kyc_documents.findUnique({ where: { id: kycDocId } });
    if (!doc) throw new NotFoundException('KYC document not found');
    if (doc.status !== 'pending') throw new BadRequestException('Document already reviewed');

    await this.prisma.kyc_documents.update({
      where: { id: kycDocId },
      data: {
        status: dto.status as any,
        reviewed_by: adminId,
        rejection_reason: dto.rejection_reason,
        reviewed_at: new Date(),
      },
    });

    const hasPersonal = Boolean(doc.first_name && doc.last_name && (doc.date_of_birth || doc.phone || doc.email));
    const hasDocument = Boolean(doc.document_type && (doc.document_number || doc.front_image || doc.back_image || doc.selfie_image));
    const hasAddress = Boolean(doc.country && doc.county && doc.city && doc.physical_address && doc.postal_code);
    const kycLevel = !hasPersonal ? 0 : !hasDocument ? 1 : !hasAddress ? 2 : 3;

    // Update user's kyc_status based on approval
    await this.prisma.users.update({
      where: { id: doc.user_id! },
      data: { kyc_status: dto.status as any, kyc_level: kycLevel },
    });

    // Log the action
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: `REVIEW_KYC_${dto.status.toUpperCase()}`,
        entity_type: 'kyc_documents',
        entity_id: kycDocId,
        new_values: dto as any,
      },
    });

    // Notify the user about the KYC decision
    try {
      const userId = doc.user_id!;
      if (userId) {
        const title = dto.status === 'verified' ? 'KYC Verified' : dto.status === 'rejected' ? 'KYC Rejected' : `KYC ${dto.status}`;
        const body = dto.status === 'verified'
          ? 'Your identity verification has been approved. You may now access verified features.'
          : dto.status === 'rejected'
            ? `Your identity verification was rejected.${dto.rejection_reason ? ' Reason: ' + dto.rejection_reason : ''}`
            : `Your KYC status was updated to ${dto.status}.`;
        await this.notifications.sendNotification(userId, { type: 'kyc_update', title, body, entityId: kycDocId, metadata: { status: dto.status } });
      }
    } catch (e) {
      this.logger.error(`Failed to send KYC decision notification: ${e}`);
    }

    return { data: doc, message: 'KYC reviewed successfully' };
  }

  // ── Superadmin Management ────────────────────────────────────────────────────
  async createSuperadmin(dto: any, adminId: string) {
    const existing = await this.prisma.users.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          { username: dto.username.toLowerCase() },
          { email: dto.email },
        ],
      },
    });

    if (existing) {
      if (existing.phone === dto.phone) throw new BadRequestException('Phone already exists');
      if (existing.username === dto.username.toLowerCase()) throw new BadRequestException('Username already taken');
      throw new BadRequestException('Email already exists');
    }

    const bcrypt = require('bcrypt');
    const password_hash = await bcrypt.hash(dto.password, 12);

    const { generateReferralCode, generateWalletAddress } = require('../common/utils/reference.util');
    const user = await this.prisma.$transaction(async (tx: any) => {
      const u = await tx.users.create({
        data: {
          first_name: dto.first_name,
          last_name: dto.last_name,
          username: dto.username.toLowerCase(),
          phone: dto.phone,
          email: dto.email,
          password_hash,
          country: dto.country,
          role: 'admin',
          phone_verified: true,
          email_verified: true,
          referral_code: generateReferralCode(),
        },
      });

      await tx.wallets.create({
        data: {
          user_id: u.id,
          wallet_name: `${u.first_name}'s Wallet`,
          wallet_type: 'user',
          wallet_address: generateWalletAddress(u.id, process.env.QR_HMAC_SECRET || 'farm-secret'),
          currency: 'FARM',
        },
      });

      await tx.audit_logs.create({
        data: {
          user_id: adminId,
          action: 'CREATE_ADMIN',
          entity_type: 'users',
          entity_id: u.id,
          new_values: { first_name: u.first_name, last_name: u.last_name, username: u.username, role: 'admin' } as any,
        },
      });

      return u;
    });

    return {
      data: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      message: 'Admin created successfully',
    };
  }

  async updateUser(userId: string, dto: any, adminId: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.is_deleted) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (dto.first_name) updateData.first_name = dto.first_name;
    if (dto.last_name) updateData.last_name = dto.last_name;
    if (dto.username) updateData.username = dto.username.toLowerCase();
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.email) updateData.email = dto.email;
    if (dto.country) updateData.country = dto.country;
    if (dto.role) updateData.role = dto.role;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    if (dto.is_suspended !== undefined) updateData.is_suspended = dto.is_suspended;

    const updated = await this.prisma.users.update({ where: { id: userId }, data: updateData });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'UPDATE_USER',
        entity_type: 'users',
        entity_id: userId,
        new_values: updateData as any,
      },
    });
    return { data: updated, message: 'User updated successfully' };
  }

  async deleteUser(userId: string, adminId: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.is_deleted) throw new NotFoundException('User not found');

    const deleted = await this.prisma.users.update({
      where: { id: userId },
      data: { is_deleted: true },
    });
    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'DELETE_USER',
        entity_type: 'users',
        entity_id: userId,
      },
    });
    return { data: deleted, message: 'User deleted successfully' };
  }

  async listSuperadmins(query: any) {
    const { skip, take } = paginationParams(query.page, query.limit);
    const where: any = { role: 'super_admin', is_deleted: false };

    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return { data, total, page: query.page ?? 1, limit: query.limit ?? 10 };
  }

  async getSuperadmin(id: string) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        username: true,
        email: true,
        phone: true,
        country: true,
        role: true,
        is_active: true,
        phone_verified: true,
        email_verified: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user || user.role !== 'super_admin') throw new NotFoundException('Superadmin not found');
    return { data: user };
  }

  async updateSuperadmin(id: string, dto: any, adminId: string) {
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user || user.role !== 'super_admin') throw new NotFoundException('Superadmin not found');

    const updateData: any = {};
    if (dto.first_name) updateData.first_name = dto.first_name;
    if (dto.last_name) updateData.last_name = dto.last_name;
    if (dto.email) updateData.email = dto.email;
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.country) updateData.country = dto.country;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;

    const updated = await this.prisma.users.update({
      where: { id },
      data: updateData,
      select: { id: true, first_name: true, last_name: true, username: true, email: true, phone: true, role: true, is_active: true },
    });

    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'UPDATE_SUPERADMIN',
        entity_type: 'users',
        entity_id: id,
        new_values: updateData as any,
      },
    });

    return { data: updated, message: 'Superadmin updated successfully' };
  }

  async deactivateSuperadmin(id: string, adminId: string) {
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user || user.role !== 'super_admin') throw new NotFoundException('Superadmin not found');

    const updated = await this.prisma.users.update({
      where: { id },
      data: { is_active: false },
      select: { id: true, first_name: true, last_name: true, username: true, role: true, is_active: true },
    });

    await this.prisma.audit_logs.create({
      data: {
        user_id: adminId,
        action: 'DEACTIVATE_SUPERADMIN',
        entity_type: 'users',
        entity_id: id,
      },
    });

    return { data: updated, message: 'Superadmin deactivated successfully' };
  }

  async getSuperadminDashboard() {
    const [totalUsers, totalTransactions, totalRevenue, activeTransactions, flaggedTx, supportTickets, pendingDisputes, pendingKyc] =
      await Promise.all([
        this.prisma.users.count({ where: { is_deleted: false } }),
        this.prisma.transactions.count({ where: { status: 'completed' } }),
        this.prisma.transactions.aggregate({
          where: { status: 'completed' },
          _sum: { amount: true },
        }),
        this.prisma.transactions.count({ where: { status: 'pending' } }),
        this.prisma.transactions.count({ where: { status: { in: ['failed', 'cancelled', 'reversed'] } } }),
        this.prisma.support_tickets?.count?.({ where: { status: 'open' } }) ?? Promise.resolve(0),
        this.prisma.escrow_contracts.count({ where: { status: 'disputed' } }),
        this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
      ]);

    const recentTx = await this.prisma.transactions.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        transaction_type: true,
        amount: true,
        status: true,
        created_at: true,
      },
    });
    // Compute escrow fee aggregates: creation (escrow_lock) and release (escrow_release)
    const [escrowCreationAgg, escrowReleaseAgg, withdrawAgg] = await Promise.all([
      this.prisma.transactions.aggregate({
        where: { transaction_type: 'escrow_lock', status: 'completed' },
        _sum: { fee: true },
        _count: { id: true },
      }),
      this.prisma.transactions.aggregate({
        where: { transaction_type: 'escrow_release', status: 'completed' },
        _sum: { fee: true },
        _count: { id: true },
      }),
      this.prisma.transactions.aggregate({
        where: { transaction_type: 'withdrawal', status: 'completed' },
        _sum: { fee: true },
        _count: { id: true },
      }),
    ]);

    const escrow_creation_earnings = Number(escrowCreationAgg._sum.fee ?? 0);
    const escrow_release_earnings = Number(escrowReleaseAgg._sum.fee ?? 0);
    const escrow_total_earnings = Number(escrow_creation_earnings + escrow_release_earnings);
    const withdraw_fee_earnings = Number(withdrawAgg._sum.fee ?? 0);
    const withdraw_transaction_count = Number(withdrawAgg._count.id ?? 0);
    const total_revenue = Number(escrow_total_earnings + withdraw_fee_earnings);

    return {
      data: {
        total_users: totalUsers,
        total_revenue,
        active_transactions: activeTransactions,
        flagged_transactions: flaggedTx,
        support_tickets: supportTickets,
        pending_disputes: pendingDisputes,
        pending_kyc: pendingKyc,
        system_health: 99,
        recent_activities: recentTx.map((tx: any) => ({
          description: `${tx.transaction_type} transaction of $${tx.amount}`,
          type: tx.transaction_type,
          timestamp: tx.created_at,
        })),
        // Escrow revenue breakdown (amounts are in FARM)
        escrow_total_earnings,
        escrow_creation_earnings,
        escrow_release_earnings,
        escrow_creation_count: escrowCreationAgg._count.id ?? 0,
        escrow_release_count: escrowReleaseAgg._count.id ?? 0,
        total_escrow_count: (escrowCreationAgg._count.id ?? 0) + (escrowReleaseAgg._count.id ?? 0),
        withdraw_fee_earnings,
        withdraw_transaction_count,
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
  // -- Superadmin Wallet Management ---------------------------------------------
  async getSuperadminWallet(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    if (!user || user.role !== 'super_admin') throw new NotFoundException('Superadmin not found');

    const wallet = user.wallets[0];
    if (!wallet) throw new NotFoundException('Superadmin wallet not found');

    // Get pending withdrawals
    const pendingWithdrawals = await this.prisma.withdrawal.aggregate({
      where: { userId, status: 'PENDING' },
      _sum: { amount: true },
    });

    // Get total withdrawn
    const totalWithdrawn = await this.prisma.withdrawal.aggregate({
      where: { userId, status: 'COMPLETED' },
      _sum: { settlement: true },
    });

    const availableBalance = Math.max(
      0,
      Number(wallet.balance ?? 0) - Number(wallet.locked_balance ?? 0),
    );

    return {
      data: {
        balance: Number(wallet.balance ?? 0),
        available_balance: availableBalance,
        locked_balance: Number(wallet.locked_balance ?? 0),
        pending_withdrawals: Number(pendingWithdrawals._sum.amount ?? 0),
        total_withdrawn: Number(totalWithdrawn._sum.settlement ?? 0),
        currency: wallet.currency ?? 'FARM',
        wallet_address: wallet.wallet_address,
      },
    };
  }

  async superadminWithdraw(userId: string, dto: any) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    if (!user || user.role !== 'super_admin') throw new NotFoundException('Superadmin not found');

    const wallet = user.wallets[0];
    if (!wallet) throw new NotFoundException('Superadmin wallet not found');

    // Use the withdrawal service to process the withdrawal
    const result = await this.withdrawService.createWithdrawal(userId, {
      amount: dto.amount,
      method: dto.method,
      phoneNumber: dto.phoneNumber,
      accountName: dto.accountName,
      accountNumber: dto.accountNumber,
      bankName: dto.bankName,
      cryptoAddress: dto.cryptoAddress,
      network: dto.network,
      pin: dto.pin,
    });

    await this.prisma.audit_logs.create({
      data: {
        user_id: userId,
        action: 'SUPERADMIN_WITHDRAWAL',
        entity_type: 'withdrawal',
        entity_id: result.withdrawal.id,
        new_values: {
          amount: dto.amount,
          method: dto.method,
          reference: result.reference,
        } as any,
      },
    });

    return result;
  }
}
