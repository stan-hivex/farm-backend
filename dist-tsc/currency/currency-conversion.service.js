"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyConversionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
let CurrencyConversionService = class CurrencyConversionService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    toNumber(value, fallback = 0) {
        const parsed = Number(value ?? fallback);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    round(value, digits = 8) {
        return Number(value.toFixed(digits));
    }
    async ensureCurrencyRatesTable() {
        try {
            const rows = await this.prisma.$queryRaw `
        SELECT to_regclass('public.currency_rates') AS exists;
      `;
            const exists = Boolean(rows?.[0]?.exists);
            if (exists) {
                return;
            }
            await this.prisma.$executeRaw `
        CREATE TABLE IF NOT EXISTS "currency_rates" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "usd_kes_rate" DECIMAL(30,8) NOT NULL,
          "farm_kes_rate" DECIMAL(30,8) NOT NULL DEFAULT 1,
          "is_active" BOOLEAN NOT NULL DEFAULT true,
          "effective_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
          "updated_by" UUID,
          CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "currency_rates_updated_by_fkey"
            FOREIGN KEY ("updated_by") REFERENCES "users"("id")
            ON DELETE NO ACTION ON UPDATE NO ACTION
        );
      `;
            await this.prisma.$executeRaw `
        CREATE INDEX IF NOT EXISTS "idx_currency_rates_active"
        ON "currency_rates" ("is_active");
      `;
        }
        catch {
        }
    }
    async getCurrentRate() {
        await this.ensureCurrencyRatesTable();
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
    async getCurrentUsdKesRate() {
        const rate = await this.getCurrentRate();
        return this.toNumber(rate.usd_kes_rate, 150);
    }
    async farmToKes(amount) {
        const current = await this.getCurrentRate();
        return this.round(this.toNumber(amount) * this.toNumber(current.farm_kes_rate, 1));
    }
    async farmToUsd(amount) {
        const current = await this.getCurrentRate();
        return this.round(this.toNumber(amount) * this.toNumber(current.farm_usd_rate, 0));
    }
    async farmToUsdc(amount) {
        return this.farmToUsd(amount);
    }
    async farmToUsdt(amount) {
        return this.farmToUsd(amount);
    }
    async usdToFarm(amount) {
        const current = await this.getCurrentRate();
        const usdKesRate = this.toNumber(current.usd_kes_rate, 150);
        const farmKesRate = this.toNumber(current.farm_kes_rate, 1);
        return this.round((this.toNumber(amount) * usdKesRate) / farmKesRate);
    }
    async ensureRateExists() {
        await this.ensureCurrencyRatesTable();
        const existing = await this.prisma.currency_rates.findFirst({
            where: { is_active: true },
            orderBy: { effective_at: 'desc' },
        });
        if (existing)
            return existing;
        return this.prisma.currency_rates.create({
            data: {
                usd_kes_rate: 150,
                farm_kes_rate: 1,
                is_active: true,
                effective_at: new Date(),
            },
        });
    }
    async updateActiveRate(usdKesRate, adminId) {
        await this.ensureCurrencyRatesTable();
        const parsedRate = Number(usdKesRate);
        if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
            throw new common_1.BadRequestException('USD/KES conversion rate must be a positive number');
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
};
exports.CurrencyConversionService = CurrencyConversionService;
exports.CurrencyConversionService = CurrencyConversionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CurrencyConversionService);
//# sourceMappingURL=currency-conversion.service.js.map