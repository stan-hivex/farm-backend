import { Injectable, Logger } from '@nestjs/common';

export interface KesRate {
  rate: number;
  source: string;
  at: Date;
}

/**
 * USDC -> KSh rate from a configured HTTPS source. No built-in or fallback
 * rate: if it is not configured or fails, conversion does not happen.
 */
@Injectable()
export class RateService {
  private readonly log = new Logger(RateService.name);
  private cache: KesRate | null = null;

  async usdcKes(env = process.env): Promise<KesRate | null> {
    const url = env.USDC_KES_RATE_URL;
    const path = env.USDC_KES_RATE_JSON_PATH;
    if (!url || !path || !url.startsWith('https://')) return null;
    const maxAge = Number(env.USDC_KES_RATE_MAX_AGE_SECONDS ?? 300) * 1000;
    if (this.cache && Date.now() - this.cache.at.getTime() < maxAge)
      return this.cache;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      const v = path
        .split('.')
        .reduce<any>((o, k) => (o == null ? o : o[k]), body);
      const rate = Number(v);
      const min = Number(env.USDC_KES_RATE_MIN ?? 50);
      const max = Number(env.USDC_KES_RATE_MAX ?? 500);
      if (!Number.isFinite(rate) || rate < min || rate > max)
        throw new Error('rate outside sanity bounds');
      this.cache = { rate, source: new URL(url).host, at: new Date() };
      return this.cache;
    } catch (e: any) {
      this.log.warn(`USDC/KES rate unavailable: ${e?.message ?? e}`);
      return null;
    }
  }
}
