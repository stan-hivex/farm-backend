import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import axios from 'axios';
import { generateTxReference } from '../common/utils/reference.util';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private cfg: ConfigService,
    private ivorypay: IvorypayService,
    private paystack: PaystackService,
  ) {}

  async initiateDeposit(
    userId: string,
    dto: { amount_fiat: number; currency: string; paymentMethod?: string; phone?: string },
    ctx?: { deviceRisk?: number; ip?: string; country?: string },
  ) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId }, select: { email: true, phone: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const reference = generateTxReference();
    const paymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
    const rate = await this.getExchangeRate(dto.currency, 'FARM');
    const amount_farm = dto.amount_fiat / rate;
    const fee_fiat = dto.amount_fiat * 0.02;
    const total_fiat = dto.amount_fiat + fee_fiat;

    const fraud = await this.assessFraudRisk(userId, {
      amount_fiat: dto.amount_fiat,
      currency: dto.currency,
      ip: ctx?.ip || '',
      deviceRisk: ctx?.deviceRisk,
      country: ctx?.country,
    });
    if (fraud.block) {
      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_blocked',
          entity_type: 'transaction',
          entity_id: null,
          new_values: { reason: fraud.reason },
        },
      });
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: 'fraud_score_high',
          description: `Blocked deposit attempt: ${fraud.reason}`,
          severity: 'high',
        },
      });
      throw new BadRequestException('Deposit blocked by fraud protection');
    }

    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });

    if (paymentMethod === 'MOBILE_MONEY') {
      const response = await this.paystack.initializePayment({
        email: user.email || `${user.phone}@farm.app`,
        amount: dto.amount_fiat,
        reference,
      });

      const tx = await this.prisma.transactions.create({
        data: {
          transaction_reference: reference,
          receiver_wallet_id: wallet?.id,
          transaction_type: 'deposit',
          status: 'pending',
          amount: amount_farm,
          fee: 0,
          net_amount: amount_farm,
          currency: 'FARM',
          description: `Pending mobile money deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
          metadata: {
            provider: 'paystack',
            amount_fiat: dto.amount_fiat,
            currency_fiat: dto.currency,
            exchange_rate: rate,
            user_id: userId,
            device_risk: ctx?.deviceRisk ?? null,
            ip: ctx?.ip ?? null,
            payment_method: 'MOBILE_MONEY',
          },
        },
      });

      this.logger.log(`initiateDeposit: created Paystack mobile-money transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);

      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_initiated',
          entity_type: 'transaction',
          entity_id: tx.id,
          new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
        },
      });

      await this.prisma.deposit.create({
        data: {
          userId,
          amount: amount_farm,
          fee: 0,
          total: amount_farm,
          currency: 'FARM',
          paymentMethod: 'MOBILE_MONEY',
          reference,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'PAYSTACK',
          reference,
          authorization_url: response.authorization_url,
        },
        message: 'Mobile money deposit initiated via Paystack checkout',
      };
    }

    if (paymentMethod === 'CRYPTO') {
      const payment = await this.ivorypay.createPayment({
        amount: Math.round(total_fiat * 100) / 100,
        currency: dto.currency,
        reference,
        email: user.email || `${user.phone}@farm.app`,
      });

      return {
        data: {
          provider: 'IVORYPAY',
          reference,
          payment_link: payment.payment_link || payment.data?.payment_link || null,
        },
        message: 'Crypto payment initiated',
      };
    }

    if (paymentMethod !== 'CARD') {
      throw new BadRequestException(`Unsupported payment method ${paymentMethod}`);
    }

    const amountKobo = Math.round(dto.amount_fiat * 100);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email || `${user.phone}@farm.app`,
        amount: amountKobo,
        reference,
        callback_url: 'https://your-app/callback',
        metadata: { user_id: userId },
      },
      {
        headers: {
          Authorization: `Bearer ${this.cfg.get('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.data?.status) {
      throw new BadRequestException(
        response.data?.message || 'Paystack initialization failed',
      );
    }

    const tx = await this.prisma.transactions.create({
      data: {
        transaction_reference: reference,
        receiver_wallet_id: wallet?.id,
        transaction_type: 'deposit',
        status: 'pending',
        amount: amount_farm,
        fee: 0,
        net_amount: amount_farm,
        currency: 'FARM',
        description: `Pending deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
        metadata: {
          provider: 'paystack',
          amount_fiat: dto.amount_fiat,
          currency_fiat: dto.currency,
          exchange_rate: rate,
          user_id: userId,
          device_risk: ctx?.deviceRisk ?? null,
          ip: ctx?.ip ?? null,
        },
      },
    });

    this.logger.log(`initiateDeposit: created transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);

    await this.prisma.audit_logs.create({
      data: {
        user_id: userId,
        action: 'deposit_initiated',
        entity_type: 'transaction',
        entity_id: tx.id,
        new_values: { reference, amount_fiat: dto.amount_fiat, amount_farm },
      },
    });

    try {
      const deposit = await this.prisma.deposit.create({
        data: {
          userId,
          amount: amount_farm,
          fee: 0,
          total: amount_farm,
          currency: 'FARM',
          paymentMethod: 'CARD',
          reference,
          status: 'PENDING',
        },
      });
      this.logger.log(`initiateDeposit: created deposit id=${deposit.id} reference=${reference} amount_farm=${amount_farm}`);
    } catch (err) {
      this.logger.error(`initiateDeposit: failed to create deposit for reference=${reference}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      data: {
        payment_url: response.data.data.authorization_url,
        reference,
        amount_farm: amount_farm.toFixed(4),
      },
      message: 'Deposit initiated',
    };
  }

  async processSuccessfulPayment(payload: {
    reference: string;
    amount: number;
    currency: string;
    provider: string;
  }) {
    const { reference } = payload;

    const transaction = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    if (transaction.transaction_type !== 'deposit') {
      throw new BadRequestException('Transaction is not a deposit');
    }
    if (transaction.status === 'completed') {
      return { ok: true };
    }

    const deposit = await this.prisma.deposit.findFirst({ where: { reference } });
    const metadata = transaction.metadata as any;
    const userId = metadata?.user_id;
    if (!userId) {
      throw new BadRequestException('Transaction user metadata is missing');
    }

    let wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });
    if (!wallet) {
      wallet = await this.prisma.wallets.create({
        data: {
          user_id: userId,
          wallet_name: 'Main Wallet',
          wallet_type: 'user',
          wallet_address: uuidv4(),
          currency: transaction.currency || 'FARM',
        },
      });
    }

    const amountToCredit = Number(transaction.amount);
    const previousBalance = Number(wallet.balance ?? 0);

    await this.prisma.$transaction(async (tx) => {
      if (deposit && deposit.status !== 'SUCCESS') {
        await tx.deposit.update({ where: { id: deposit.id }, data: { status: 'SUCCESS' } });
      }
      if (!deposit) {
        await tx.deposit.create({
          data: {
            userId,
            amount: amountToCredit,
            fee: 0,
            total: amountToCredit,
            currency: transaction.currency || 'FARM',
            paymentMethod: payload.provider.toUpperCase() === 'PAYSTACK' ? 'CARD' : 'CRYPTO',
            reference,
            status: 'SUCCESS',
          },
        });
      }

      await tx.wallets.update({
        where: { id: wallet.id },
        data: { balance: { increment: amountToCredit } },
      });

      await tx.ledger_entries.create({
        data: {
          transaction_id: transaction.id,
          wallet_id: wallet.id,
          entry_type: 'credit',
          amount: amountToCredit,
          balance_before: previousBalance,
          balance_after: previousBalance + amountToCredit,
          description: `Paystack deposit completed — ref: ${reference}`,
        },
      });

      await tx.transactions.update({
        where: { id: transaction.id },
        data: {
          status: 'completed',
          receiver_wallet_id: wallet.id,
          processed_at: new Date(),
        },
      });
    });

    return { ok: true };
  }

  async requestWithdrawal(userId: string, dto: {
    amount_farm: number; currency_fiat: string; method: string; destination: string;
  }, ctx?: { deviceRisk?: number; ip?: string }) {
    const wallet = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const available = Number(wallet.balance) - Number(wallet.locked_balance);
    if (available < dto.amount_farm)
      throw new BadRequestException(`Insufficient balance. Available: ${available.toFixed(2)} FARM`);

    const rate = await this.getExchangeRate('FARM', dto.currency_fiat);
    const amount_fiat = dto.amount_farm * rate;

    // Fraud check for withdrawals as well (based on fiat equivalent)
    const fraud = await this.assessFraudRisk(userId, {
      amount_fiat,
      currency: dto.currency_fiat,
      ip: ctx?.ip || '',
      deviceRisk: ctx?.deviceRisk,
    });
    if (fraud.block) {
      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'withdrawal_blocked',
          entity_type: 'transaction',
          entity_id: null,
          new_values: { reason: fraud.reason },
        },
      });
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: 'fraud_score_high',
          description: `Blocked withdrawal attempt: ${fraud.reason}`,
          severity: 'high',
        },
      });
      throw new BadRequestException('Withdrawal blocked by fraud protection');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.wallets.update({
        where: { id: wallet.id },
        data: { locked_balance: { increment: dto.amount_farm } },
      });
      const tr = await tx.transactions.create({
        data: {
          transaction_reference: generateTxReference(),
          sender_wallet_id: wallet.id,
          transaction_type: 'withdrawal',
          status: 'pending',
          amount: dto.amount_farm,
          fee: 0,
          net_amount: dto.amount_farm,
          currency: 'FARM',
          description: `Withdrawal: ${dto.amount_farm} FARM → ${dto.currency_fiat} ${amount_fiat.toFixed(2)}`,
          metadata: {
            method: dto.method,
            destination: dto.destination,
            currency_fiat: dto.currency_fiat,
            amount_fiat,
            exchange_rate: rate,
          },
        },
      });

      // Create a ledger entry to reflect held funds
      const balanceBefore = Number(wallet.balance || 0);
      await tx.ledger_entries.create({
        data: {
          transaction_id: tr.id,
          wallet_id: wallet.id,
          entry_type: 'hold',
          amount: Number(dto.amount_farm),
          balance_before: balanceBefore,
          balance_after: balanceBefore - Number(dto.amount_farm),
          description: `Withdrawal hold — ref: ${tr.transaction_reference}`,
        },
      });

      // Audit: withdrawal requested
      await tx.audit_logs.create({
        data: {
          user_id: userId,
          action: 'withdrawal_requested',
          entity_type: 'transaction',
          entity_id: tr.id,
          new_values: { amount: dto.amount_farm, destination: dto.destination },
        },
      });

      return tr;
    });

    return {
      data: result,
      message: 'Withdrawal request submitted. Processing within 1-3 business days.',
    };
  }

  async getExchangeRate(from: string, to: string): Promise<number> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    if (
      (fromCode === 'FARM' && toCode === 'KES') ||
      (fromCode === 'KES' && toCode === 'FARM')
    ) {
      return 1;
    }

    const rate = await this.prisma.exchange_rates.findFirst({
      where: { base_currency: fromCode, target_currency: toCode },
      orderBy: { fetched_at: 'desc' },
    });
    return rate ? Number(rate.rate) : 1;
  }

  // Simple fraud assessment: velocity and amount thresholds.
  private async assessFraudRisk(userId: string, ctx: { amount_fiat: number; currency: string; ip?: string; deviceRisk?: number; country?: string }) {
    // Load configurable thresholds from system_settings
    const keys = ['fraud.amount_threshold', 'fraud.velocity_limit', 'fraud.max_daily_amount'];
    const settings = await this.prisma.system_settings.findMany({ where: { setting_key: { in: keys } } });
    const getSetting = (k: string) => {
      const s = settings.find((x: any) => x.setting_key === k);
      if (!s || s.setting_value == null) return null;
      // Try parse JSON then number
      try { return JSON.parse(s.setting_value); } catch { /* ignore */ }
      const n = Number(s.setting_value);
      return Number.isFinite(n) ? n : s.setting_value;
    };

    const amountThreshold = Number(getSetting('fraud.amount_threshold') ?? 5000);
    const velocityLimit = Number(getSetting('fraud.velocity_limit') ?? 5);
    const maxDailyAmount = Number(getSetting('fraud.max_daily_amount') ?? 20000);

    // Count recent deposits by this user in the last 1 hour
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60);
    const recent = await this.prisma.transactions.count({
      where: {
        transaction_type: 'deposit',
        created_at: { gte: oneHourAgo },
        AND: [{ metadata: { path: ['user_id'], equals: userId } as any }],
      },
    });

    // Sum of today's deposits for max daily check
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todays = await this.prisma.transactions.aggregate({
      _sum: { amount: true },
      where: {
        transaction_type: 'deposit',
        created_at: { gte: startOfDay },
        AND: [{ metadata: { path: ['user_id'], equals: userId } as any }],
      },
    });
    const todaysSum = Number((todays._sum as any)?.amount ?? 0);

    // Apply system settings checks first
    if (ctx.amount_fiat > amountThreshold) {
      return { block: true, reason: 'amount_exceeds_threshold', threshold: amountThreshold };
    }
    if (recent >= velocityLimit) {
      return { block: true, reason: 'high_velocity', limit: velocityLimit };
    }
    if (todaysSum + ctx.amount_fiat > maxDailyAmount) {
      return { block: true, reason: 'daily_limit_exceeded', maxDailyAmount };
    }

    // Load rule file if present and evaluate rules in priority order
    try {
      const rulesPath = path.join(process.cwd(), 'fraud.rules.json');
      if (fs.existsSync(rulesPath)) {
        const raw = fs.readFileSync(rulesPath, 'utf8');
        const rules = JSON.parse(raw) as any[];
        // sort by priority desc
        rules.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
        for (const r of rules) {
          // skip rules that don't apply by amount range
          if (r.min_amount && ctx.amount_fiat < r.min_amount) continue;
          if (r.max_amount && ctx.amount_fiat > r.max_amount) continue;

          // country check - requires ctx.country in metadata in future
          if (r.countries && Array.isArray(r.countries)) {
            const country = (ctx as any).country;
            if (!country) continue;
            if (r.countries.indexOf(country) === -1) continue;
          }

          // ip prefix matching
          if (r.ip_prefixes && Array.isArray(r.ip_prefixes) && ctx.ip) {
            let matched = false;
            for (const pfx of r.ip_prefixes) {
              if (ctx.ip.startsWith(pfx)) {
                matched = true; break;
              }
            }
            if (!matched) continue;
          }

          // device risk
          if (r.device_risk_threshold) {
            const dv = Number((ctx as any).deviceRisk || 0);
            if (dv < Number(r.device_risk_threshold)) continue;
          }

          // matched
          if (r.action === 'block') return { block: true, reason: r.reason || r.id, rule: r.id };
          if (r.action === 'challenge') return { block: false, challenge: true, reason: r.reason || r.id, rule: r.id };
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to evaluate fraud.rules: ${err?.message ?? String(err)}`);
    }

    return { block: false };
  }

  async getDepositHistory(userId: string) {
    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
    const items = await this.prisma.transactions.findMany({
      where: { transaction_type: 'deposit', receiver_wallet_id: wallet?.id },
      orderBy: { created_at: 'desc' },
    });
    return { data: items.map((t) => ({ ...t, amount: Number(t.amount) })) };
  }

  async getWithdrawalHistory(userId: string) {
  const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId } });
  const items = await this.prisma.transactions.findMany({
    where: { transaction_type: 'withdrawal', sender_wallet_id: wallet?.id },
    orderBy: { created_at: 'desc' },
  });
  return {
    data: items.map((t) => {
      const meta = t.metadata as any ?? {};
      const status = (t.status ?? 'UNKNOWN').toUpperCase();
      return {
        ...t,
        amount: Number(t.amount),
        // Hoist metadata fields to top level so the Flutter widget can read them
        method: meta.method ?? 'BANK',
        status: t.status === 'completed' ? 'SUCCESS' : status,
      };
    }),
  };
}
}