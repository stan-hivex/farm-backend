import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  computeFee,
  creditPlatformInTx,
  creditWalletInTx,
  defaultPercent,
  FEE_KEYS,
  FeeKey,
  FeeRule,
} from './fee-defaults';

const TTL_MS = 30_000;

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);
  private cache: { at: number; rules: Map<FeeKey, FeeRule> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.cache = null;
  }

  async rules(): Promise<Map<FeeKey, FeeRule>> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS)
      return this.cache.rules;
    const map = new Map<FeeKey, FeeRule>();
    let rows: any[] = [];
    try {
      rows = await this.prisma.fee_configurations.findMany({
        where: { transaction_type: { in: [...FEE_KEYS] }, is_active: true },
        orderBy: { created_at: 'desc' },
      });
    } catch (e) {
      this.logger.warn(`Fee table unavailable, using defaults: ${String(e)}`);
    }
    for (const key of FEE_KEYS) {
      const row = rows.find((r) => r.transaction_type === key);
      if (row) {
        map.set(key, {
          key,
          percent: Number(row.percentage_fee ?? 0),
          flat: Number(row.flat_fee ?? 0),
          min: Number(row.minimum_fee ?? 0),
          max: Number(row.maximum_fee ?? 0),
          source: 'db',
          label: row.label,
          payer: row.payer,
          destination_wallet_id: row.destination_wallet_id,
        });
      } else {
        const d = defaultPercent(key);
        map.set(key, {
          key,
          percent: d.v,
          flat: 0,
          min: 0,
          max: 0,
          source: d.src,
          destination_wallet_id:
            key === 'project_listing'
              ? process.env.CONSOLIDATION_FUND_WALLET_ID || null
              : null,
        });
      }
    }
    this.cache = { at: Date.now(), rules: map };
    return map;
  }

  async rule(key: FeeKey): Promise<FeeRule> {
    return (await this.rules()).get(key)!;
  }

  async fee(key: FeeKey, amount: number, dp = 2): Promise<number> {
    return computeFee(await this.rule(key), amount, dp);
  }

  /** Public schedule for apps: rates only, no wallet ids. */
  async publicSchedule() {
    const rules = await this.rules();
    return {
      data: [...rules.values()].map((r) => ({
        key: r.key,
        label: r.label ?? r.key,
        percent: r.percent,
        flat: r.flat,
        min: r.min,
        max: r.max,
        payer: r.payer ?? null,
      })),
    };
  }

  async quote(key: string, amount: number) {
    if (!(FEE_KEYS as readonly string[]).includes(key))
      throw new BadRequestException('Unknown fee type');
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Amount must be positive');
    const r = await this.rule(key as FeeKey);
    const fee = computeFee(r, amount);
    return { data: { key, amount, percent: r.percent, fee } };
  }

  creditPlatformInTx(
    tx: any,
    amount: number,
    description: string,
    transactionId?: string,
  ) {
    return creditPlatformInTx(tx, amount, description, transactionId);
  }

  creditWalletInTx(
    tx: any,
    walletId: string,
    amount: number,
    description: string,
    transactionId?: string,
  ) {
    return creditWalletInTx(tx, walletId, amount, description, transactionId);
  }
}
