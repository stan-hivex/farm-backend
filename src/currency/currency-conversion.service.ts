import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CurrencyConversionService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: any, fallback = 0): number {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private round(value: number, digits = 8): number {
    return Number(value.toFixed(digits));
  }

  async getCurrentRate(): Promise<any> {
    const record = await this.prisma.currency_rates.findFirst({
      where: { is_active: true },
      orderBy: { effective_at: 'desc' },
    });

    const usdKesRate = this.toNumber(record?.usd_kes_rate ?? 150, 150);
    const farmKesRate = this.toNumber(record?.farm_kes_rate ?? 1, 1);
    const farmUsdRate = this.round(farmKesRate / usdKesRate, 8);

    return {
      id: record?.id ?? null,
      usd_kes_rate: usdKesRate,
      farm_kes_rate: farmKesRate,
      farm_usd_rate: farmUsdRate,
      farm_usdc_rate: farmUsdRate,
      farm_usdt_rate: farmUsdRate,
      is_active: record?.is_active ?? true,
      effective_at: record?.effective_at ?? new Date(),
    };
  }

  async getCurrentUsdKesRate(): Promise<number> {
    const rate = await this.getCurrentRate();
    return this.toNumber(rate.usd_kes_rate, 150);
  }

  async farmToKes(amount: number): Promise<number> {
    const current = await this.getCurrentRate();
    return this.round(this.toNumber(amount) * this.toNumber(current.farm_kes_rate, 1));
  }

  async farmToUsd(amount: number): Promise<number> {
    const current = await this.getCurrentRate();
    return this.round(this.toNumber(amount) * this.toNumber(current.farm_usd_rate, 0));
  }

  async farmToUsdc(amount: number): Promise<number> {
    return this.farmToUsd(amount);
  }

  async farmToUsdt(amount: number): Promise<number> {
    return this.farmToUsd(amount);
  }

  async usdToFarm(amount: number): Promise<number> {
    const usdKesRate = await this.getCurrentUsdKesRate();
    return this.round(this.toNumber(amount) * usdKesRate);
  }

  async ensureRateExists(): Promise<any> {
    const existing = await this.prisma.currency_rates.findFirst({
      where: { is_active: true },
      orderBy: { effective_at: 'desc' },
    });

    if (existing) return existing;

    return this.prisma.currency_rates.create({
      data: {
        usd_kes_rate: 150,
        farm_kes_rate: 1,
        is_active: true,
        effective_at: new Date(),
      },
    });
  }

  async updateActiveRate(usdKesRate: number, adminId?: string): Promise<any> {
    const parsedRate = Number(usdKesRate);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      throw new BadRequestException('USD/KES conversion rate must be a positive number');
    }

    await this.prisma.currency_rates.updateMany({
      where: { is_active: true },
      data: { is_active: false },
    });

    return this.prisma.currency_rates.create({
      data: {
        usd_kes_rate: parsedRate,
        farm_kes_rate: 1,
        is_active: true,
        effective_at: new Date(),
        updated_by: adminId ?? null,
      },
    });
  }
}
