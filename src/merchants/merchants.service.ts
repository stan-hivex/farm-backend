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
    const qrData = await this.qrService.getMerchantQr(merchant.id);

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [salesToday, totalRevenue, currentMonthRevenue, previousMonthRevenue, recentTxns] = await Promise.all([
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id,
          transaction_type: 'merchant_payment',
          status: 'completed',
          created_at: { gte: today },
        },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id,
          transaction_type: 'merchant_payment',
          status: 'completed',
        },
        _sum: { amount: true }, _count: true,
      }),
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id,
          transaction_type: 'merchant_payment',
          status: 'completed',
          created_at: { gte: currentMonthStart, lt: nextMonthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.transactions.aggregate({
        where: {
          receiver_wallet_id: wallet?.id,
          transaction_type: 'merchant_payment',
          status: 'completed',
          created_at: { gte: previousMonthStart, lt: currentMonthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.transactions.findMany({
        where: { receiver_wallet_id: wallet?.id, transaction_type: 'merchant_payment' },
        orderBy: { created_at: 'desc' }, take: 10,
      }),
    ]);

    const currentMonthRevenueValue = Number(currentMonthRevenue._sum.amount || 0);
    const previousMonthRevenueValue = Number(previousMonthRevenue._sum.amount || 0);
    const monthlyGrowth = previousMonthRevenueValue === 0
      ? (currentMonthRevenueValue === 0 ? 0 : 100)
      : Number((((currentMonthRevenueValue - previousMonthRevenueValue) / previousMonthRevenueValue) * 100).toFixed(2));

    // Enrich recent transactions with customer username where possible
    const enrichedRecent = await Promise.all(recentTxns.map(async (t: any) => {
      const txn: any = { ...t };
      txn.amount = Number(txn.amount || 0);

      // Try to find a direct customer_id on the transaction or in metadata
      let customerId: string | undefined;
      if (txn.customer_id) customerId = txn.customer_id;
      if (!customerId && txn.metadata && typeof txn.metadata === 'object') {
        customerId = (txn.metadata as any).user_id || (txn.metadata as any).customer_id;
      }

      let customerName = '@user';
      let merchantBusinessName = '';

      if (customerId) {
        const u = await this.prisma.users.findUnique({ where: { id: customerId } });
        if (u && u.username) customerName = `@${u.username}`;
      } else if (txn.sender_wallet_id) {
        // Fallback: fetch sender wallet and its user
        const senderWallet = await this.prisma.wallets.findUnique({
          where: { id: txn.sender_wallet_id },
          include: { users: true },
        });
        const u = senderWallet?.users as any | undefined;
        if (u && u.username) customerName = `@${u.username}`;
      }

      if (txn.metadata && typeof txn.metadata === 'object') {
        const merchantId = (txn.metadata as any).merchant_id || (txn.metadata as any).merchantId;
        if (merchantId) {
          const merchant = await this.prisma.merchants.findUnique({
            where: { id: merchantId },
            select: { business_name: true },
          });
          if (merchant?.business_name) merchantBusinessName = merchant.business_name;
        }
      }

      txn.customer_name = customerName;
      txn.merchant_business_name = merchantBusinessName;
      return txn;
    }));

    return {
      data: {
        merchant: {
          id: merchant.id, business_name: merchant.business_name,
          status: merchant.status, qr_code: merchant.qr_code,
          qr_payload: qrData?.data?.qr_payload ?? merchant.qr_code,
          qr_image_base64: qrData?.data?.qr_image_base64,
          qr_image_data_url: qrData?.data?.qr_image_data_url ?? qrData?.data?.qr_image_base64,
          qrImageBase64: qrData?.data?.qr_image_base64,
          qrImageDataUrl: qrData?.data?.qr_image_data_url ?? qrData?.data?.qr_image_base64,
        },
        stats: {
          sales_today: Number(salesToday._sum.amount || 0),
          sales_today_count: salesToday._count,
          total_revenue: Number(totalRevenue._sum.amount || 0),
          total_transactions: totalRevenue._count,
          wallet_balance: Number(wallet?.balance || 0),
          current_month_revenue: currentMonthRevenueValue,
          previous_month_revenue: previousMonthRevenueValue,
          monthly_growth_percentage: monthlyGrowth,
        },
        recent_transactions: enrichedRecent,
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
    return this.qrService.generateMerchantQr(merchant.id);
  }

  async getMerchantQr(userId: string) {
    const merchant = await this.getMerchantByUser(userId);
    if (!merchant.qr_code) {
      return this.qrService.generateMerchantQr(merchant.id);
    }
    return this.qrService.getMerchantQr(merchant.id);
  }

  private async getMerchantByUser(userId: string) {
    const m = await this.prisma.merchants.findFirst({ where: { user_id: userId } });
    if (!m) throw new BadRequestException('Merchant account not found. Please apply first.');
    return m;
  }
}