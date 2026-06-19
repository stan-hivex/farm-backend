import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { QrService } from '../qr/qr.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';
import { randomBytes } from 'crypto';

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService, private qrService: QrService) {}

  async apply(userId: string, dto: {
    business_name: string; business_type?: string;
    business_email?: string; business_phone?: string;
    country?: string; city?: string;
  }) {
    const existing = await this.prisma.merchants.findFirst({ where: { user_id: userId } });
    if (existing) throw new BadRequestException('You already have a merchant application');
    const merchant = await this.prisma.merchants.create({
      data: {
        user_id: userId, ...dto,
        qr_secret: randomBytes(32).toString('hex'),
        status: 'pending',
      },
    });
    return { data: merchant, message: 'Application submitted. Pending review.' };
  }

  async getDashboard(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { kyc_status: true, kyc_level: true },
    });
    if (!user || user.kyc_status !== 'verified' || Number(user.kyc_level || 0) < 3) {
      throw new ForbiddenException('Full KYC verification is required to access the merchant dashboard');
    }

    const merchant = await this.getMerchantByUser(userId);
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [salesToday, totalRevenue, recentTxns] = await Promise.all([
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment',
          status: 'completed', created_at: { gte: today },
        },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id,
          transaction_type: 'merchant_payment', status: 'completed',
        },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transactions.findMany({
        where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
        orderBy: { created_at: 'desc' }, take: 10,
      }),
    ]);

    return {
      data: {
        merchant: {
          id: merchant.id, business_name: merchant.business_name,
          status: merchant.status, qr_code: merchant.qr_code,
        },
        stats: {
          sales_today: Number(salesToday._sum.amount || 0),
          sales_today_count: salesToday._count,
          total_revenue: Number(totalRevenue._sum.amount || 0),
          total_transactions: totalRevenue._count,
          wallet_balance: Number(wallet?.balance || 0),
        },
        recent_transactions: recentTxns.map((t) => ({ ...t, amount: Number(t.amount) })),
      },
    };
  }

  async getMyMerchant(userId: string) {
    return { data: await this.getMerchantByUser(userId) };
  }

  async getTransactions(userId: string, query: any) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.transactions.findMany({
        where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
        skip, take, orderBy: { created_at: 'desc' },
      }),
      this.prisma.transactions.count({
        where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
      }),
    ]);
    return {
      data: items.map((t) => ({ ...t, amount: Number(t.amount) })),
      meta: paginate(total, page, limit),
    };
  }

  async requestPayout(userId: string, dto: {
    amount: number; payout_method: string;
    account_name: string; account_number: string;
  }) {
    const merchant = await this.getMerchantByUser(userId);
    if (merchant.status !== 'approved') throw new ForbiddenException('Merchant not approved');
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const available = Number(wallet?.balance || 0) - Number(wallet?.locked_balance || 0);
    if (available < dto.amount) throw new BadRequestException('Insufficient balance');
    const payout = await this.prisma.merchant_payouts.create({
      data: {
        merchant_id: merchant.id, amount: dto.amount,
        payout_method: dto.payout_method, account_name: dto.account_name,
        account_number: dto.account_number, status: 'pending',
      },
    });
    return { data: payout, message: 'Payout request submitted' };
  }

  async getPayouts(userId: string, query: any) {
    const merchant = await this.getMerchantByUser(userId);
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.merchant_payouts.findMany({
        where: { merchant_id: merchant.id }, skip, take, orderBy: { created_at: 'desc' },
      }),
      this.prisma.merchant_payouts.count({ where: { merchant_id: merchant.id } }),
    ]);
    return {
      data: items.map((p) => ({ ...p, amount: Number(p.amount) })),
      meta: paginate(total, page, limit),
    };
  }

  async regenerateQr(userId: string) {
    const merchant = await this.getMerchantByUser(userId);
    if (merchant.status !== 'approved') throw new ForbiddenException('Merchant not approved');
    return this.qrService.generateMerchantQr(merchant.id);
  }

  private async getMerchantByUser(userId: string) {
    const m = await this.prisma.merchants.findFirst({ where: { user_id: userId } });
    if (!m) throw new BadRequestException('Merchant account not found. Please apply first.');
    return m;
  }
}