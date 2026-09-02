import { PrismaService } from '../database/prisma.service';
export declare class CurrencyConversionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private toNumber;
    private round;
    private ensureCurrencyRatesTable;
    getCurrentRate(): Promise<any>;
    getCurrentUsdKesRate(): Promise<number>;
    farmToKes(amount: number): Promise<number>;
    farmToUsd(amount: number): Promise<number>;
    farmToUsdc(amount: number): Promise<number>;
    farmToUsdt(amount: number): Promise<number>;
    usdToFarm(amount: number): Promise<number>;
    ensureRateExists(): Promise<any>;
    updateActiveRate(usdKesRate: number, adminId?: string): Promise<any>;
}
