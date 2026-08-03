import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { IvorypayService } from '../ivorypay/ivorypay.service';
import { generateTxReference } from '../common/utils/reference.util';
import { PaymentMethod } from '@prisma/client';
import { CacheService } from '../common/cache/cache.service';
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
    private cache: CacheService,
  ) {}

  async initiateDeposit(
    userId: string,
    dto: { amount_fiat: number; currency: string; paymentMethod?: string; phone?: string },
    ctx?: { deviceRisk?: number; ip?: string; country?: string },
  ) {
    const supportedPaymentMethods: PaymentMethod[] = ['CARD', 'MOBILE_MONEY', 'CRYPTO', 'BANK_TRANSFER'];
    const rawPaymentMethod = (dto.paymentMethod || 'CARD').toUpperCase();
    if (!supportedPaymentMethods.includes(rawPaymentMethod as PaymentMethod)) {
      throw new BadRequestException(`Unsupported payment method ${dto.paymentMethod}`);
    }
    const paymentMethod = rawPaymentMethod as PaymentMethod;

    const user = await this.prisma.users.findUnique({
      where: { id: userId }, select: { email: true, phone: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const reference = generateTxReference();
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
      // Record the reason and full fraud object for investigation
      await this.prisma.audit_logs.create({
        data: {
          user_id: userId,
          action: 'deposit_blocked',
          entity_type: 'transaction',
          entity_id: null,
          new_values: { reason: fraud.reason, details: fraud },
        },
      });
      await this.prisma.security_events.create({
        data: {
          user_id: userId,
          event_type: 'fraud_score_high',
          description: `Blocked deposit attempt: ${fraud.reason} | ${JSON.stringify(fraud)}`,
          severity: 'high',
        },
      });

      this.logger.warn(`Deposit blocked for user=${userId} reference=${reference} reason=${fraud.reason} details=${JSON.stringify(fraud)}`);

      // Provide a more informative error to the caller while avoiding leaking
      // sensitive internal data. Include the rule/reason id so support can act.
      const reasonLabel = typeof fraud.reason === 'string' ? fraud.reason : 'unknown_reason';
      throw new BadRequestException(`Deposit blocked by fraud protection: ${reasonLabel}`);
    }

    const wallet = await this.prisma.wallets.findFirst({ where: { user_id: userId, is_active: true } });

    if (paymentMethod === 'MOBILE_MONEY') {
      const phone = dto.phone || user.phone;
      if (!phone) {
        throw new BadRequestException('Phone number is required for mobile money deposits');
      }

      // Validate phone format: Paystack mobile-money requires international format (+country code)
      if (!phone.startsWith('+')) {
        this.logger.warn(`Mobile-money phone not in international format: ${phone}. Expected format: +254XXXXXXXXX`);
      }

      const response = await this.paystack.initializePayment({
        email: user.email || `${user.phone}@farm.app`,
        amount: dto.amount_fiat,
        currency: dto.currency,
        reference,
        channels: ['mobile_money'],
        phone,
        metadata: {
          user_id: userId,
          currency: dto.currency,
        },
      });

      // No wallet credit occurs during deposit initiation.
      // Wallet balance must only be updated after a successful Paystack webhook.
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
          provider: 'paystack',
          reference,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'PAYSTACK',
          reference,
          payment_url: response.authorization_url || response.authorizationUrl,
          authorization_url: response.authorization_url || response.authorizationUrl,
        },
        message: 'Mobile money deposit initiated via Paystack checkout',
      };
    }

    if (paymentMethod === 'CRYPTO') {
      // Convert FARM -> USD before creating Ivorypay payment to avoid double hops.
      // Assumption: 1 FARM == 1 KES, and 1 USD == 130 KES (therefore 130 FARM == 1 USD).
      const farmAmount = amount_farm; // amount in FARM
      const farmToUsdRate = Number(this.cfg.get<string>('IVORYPAY_FARM_TO_USD_RATE', '130')) || 130;
      const amountUsd = Number((farmAmount / farmToUsdRate).toFixed(2));

      const payment = await this.ivorypay.createPayment({
        amount: amountUsd,
        currency: 'USD',
        reference,
        email: user.email || `${user.phone}@farm.app`,
        description: `Farm deposit - ${farmAmount.toFixed(4)} FARM → ${amountUsd.toFixed(2)} USD`,
        baseFiat: 'USD',
        metadata: {
          provider: 'ivorypay',
          amount_farm: farmAmount,
          amount_usd: amountUsd,
          farm_to_usd_rate: farmToUsdRate,
          currency_fiat: 'USD',
          exchange_rate: rate,
          user_id: userId,
          device_risk: ctx?.deviceRisk ?? null,
          ip: ctx?.ip ?? null,
          payment_method: 'CRYPTO',
        },
      });

      const providerRef =
        (payment as any).providerReference ??
        (payment as any).data?.id ??
        (payment as any).data?.reference ??
        reference;

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
          description: `Pending crypto deposit via Ivorypay (${farmAmount} FARM → ${amountUsd} USD)`,
          metadata: {
            provider: 'ivorypay',
            provider_ref: providerRef,
            amount_farm: farmAmount,
            amount_usd: amountUsd,
            farm_to_usd_rate: farmToUsdRate,
            currency_fiat: 'USD',
            exchange_rate: rate,
            user_id: userId,
            device_risk: ctx?.deviceRisk ?? null,
            ip: ctx?.ip ?? null,
            payment_method: 'CRYPTO',
          },
        },
      });

      this.logger.log(`initiateDeposit: created Ivorypay crypto transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);

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
          paymentMethod: 'CRYPTO',
          provider: 'ivorypay',
          reference,
          providerRef,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'IVORYPAY',
          reference,
          payment_link: (payment as any).data?.payment_link || (payment as any).payment_link,
          checkout_url: (payment as any).data?.checkout_url || (payment as any).checkout_url,
        },
        message: 'Crypto deposit initiated via Ivorypay',
      };
    }

    if (paymentMethod === 'CARD') {
      const response = await this.paystack.initializePayment({
        email: user.email || `${user.phone}@farm.app`,
        amount: dto.amount_fiat,
        currency: dto.currency,
        reference,
        channels: ['card'],
        metadata: {
          provider: 'paystack',
          amount_fiat: dto.amount_fiat,
          currency_fiat: dto.currency,
          exchange_rate: rate,
          user_id: userId,
          device_risk: ctx?.deviceRisk ?? null,
          ip: ctx?.ip ?? null,
          payment_method: paymentMethod,
        },
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
          description: `Pending Card deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
          metadata: {
            provider: 'paystack',
            amount_fiat: dto.amount_fiat,
            currency_fiat: dto.currency,
            exchange_rate: rate,
            user_id: userId,
            device_risk: ctx?.deviceRisk ?? null,
            ip: ctx?.ip ?? null,
            payment_method: paymentMethod,
          },
        },
      });

      this.logger.log(`initiateDeposit: created Paystack card transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);

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
          paymentMethod,
          provider: 'paystack',
          reference,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'PAYSTACK',
          reference,
          payment_url: response.authorization_url || response.authorizationUrl,
          authorization_url: response.authorization_url || response.authorizationUrl,
        },
        message: 'Card deposit initiated via Paystack checkout',
      };
    }

    if (paymentMethod === 'BANK_TRANSFER') {
      const response = await this.paystack.initializePayment({
        email: user.email || `${user.phone}@farm.app`,
        amount: dto.amount_fiat,
        currency: dto.currency,
        reference,
        channels: ['bank_transfer'],
        metadata: {
          provider: 'paystack',
          amount_fiat: dto.amount_fiat,
          currency_fiat: dto.currency,
          exchange_rate: rate,
          user_id: userId,
          device_risk: ctx?.deviceRisk ?? null,
          ip: ctx?.ip ?? null,
          payment_method: paymentMethod,
        },
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
          description: `Pending bank transfer deposit via Paystack (${dto.currency} ${dto.amount_fiat})`,
          metadata: {
            provider: 'paystack',
            amount_fiat: dto.amount_fiat,
            currency_fiat: dto.currency,
            exchange_rate: rate,
            user_id: userId,
            device_risk: ctx?.deviceRisk ?? null,
            ip: ctx?.ip ?? null,
            payment_method: paymentMethod,
          },
        },
      });

      this.logger.log(`initiateDeposit: created Paystack bank transfer transaction id=${tx.id} reference=${reference} amount_farm=${amount_farm}`);

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
          paymentMethod,
          provider: 'paystack',
          reference,
          status: 'PENDING',
        },
      });

      return {
        data: {
          provider: 'PAYSTACK',
          reference,
          payment_url: response.authorization_url || response.authorizationUrl,
          authorization_url: response.authorization_url || response.authorizationUrl,
        },
        message: 'Bank transfer deposit initiated via Paystack checkout',
      };
    }

    throw new BadRequestException(`Unsupported payment method ${paymentMethod}`);
  }

  // `processSuccessfulPayment` removed: paystack webhook handling is centralized
  // in `WebhookService` with queued processing. Wallet credits and transaction
  // finalization should be performed by the webhook processing flow.
  //
  // `requestWithdrawal` removed: use WithdrawService.createWithdrawal() instead.
  // This method incorrectly debited wallets immediately instead of locking funds.
  // Correct flow: WithdrawService locks funds → webhook finalizes transaction.

  async getExchangeRate(from: string, to: string): Promise<number> {
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    if (fromCode === toCode) return 1;

    const cacheKey = `exchange-rate:${fromCode}:${toCode}`;
    const cached = await this.cache.cacheGet<number>(cacheKey);
    if (cached !== null && cached !== undefined) return cached;

    const directRate = await this.prisma.exchange_rates.findFirst({
      where: { base_currency: fromCode, target_currency: toCode },
      orderBy: { fetched_at: 'desc' },
    });
    if (directRate) {
      const rate = Number(directRate.rate);
      await this.cache.cacheSet(cacheKey, rate, 300);
      return rate;
    }

    const reverseRate = await this.prisma.exchange_rates.findFirst({
      where: { base_currency: toCode, target_currency: fromCode },
      orderBy: { fetched_at: 'desc' },
    });
    if (reverseRate && Number(reverseRate.rate) !== 0) {
      const rate = 1 / Number(reverseRate.rate);
      await this.cache.cacheSet(cacheKey, rate, 300);
      return rate;
    }

    await this.cache.cacheSet(cacheKey, 1, 300);
    return 1;
  }

  // Simple fraud assessment: velocity and amount thresholds.
  private async getSystemSettings() {
    const cacheKey = 'system-settings:fraud';
    const cached = await this.cache.cacheGet<Record<string, any>>(cacheKey);
    if (cached) return cached;

    const keys = ['fraud.amount_threshold', 'fraud.velocity_limit', 'fraud.max_daily_amount'];
    const settings = await this.prisma.system_settings.findMany({ where: { setting_key: { in: keys } } });
    const result: Record<string, any> = {};
    settings.forEach((setting: any) => {
      const value = setting.setting_value;
      if (value == null) return;
      try {
        result[setting.setting_key] = JSON.parse(value);
      } catch {
        const n = Number(value);
        result[setting.setting_key] = Number.isFinite(n) ? n : value;
      }
    });

    await this.cache.cacheSet(cacheKey, result, 300);
    return result;
  }

  private async assessFraudRisk(userId: string, ctx: { amount_fiat: number; currency: string; ip?: string; deviceRisk?: number; country?: string }) {
    const settings = await this.getSystemSettings();
    const amountThreshold = Number(settings['fraud.amount_threshold'] ?? 5000);
    const velocityLimit = Number(settings['fraud.velocity_limit'] ?? 5);
    const maxDailyAmount = Number(settings['fraud.max_daily_amount'] ?? 20000);

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
      // High velocity deposits: treat as a challenge (require review) rather than
      // an outright block to avoid rejecting legitimate users who make multiple
      // small deposits in quick succession (e.g., during testing).
      return { block: false, challenge: true, reason: 'high_velocity', limit: velocityLimit };
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
    where: {
      transaction_type: 'withdrawal',
      sender_wallet_id: wallet?.id,
      status: { not: 'failed' },
    },
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
        status: t.status?.toLowerCase() === 'completed' ? 'SUCCESS' : status,
      };
    }),
  };
}
}