import { Injectable, Logger } from '@nestjs/common';

export interface KesRate {
  rate: number;
  mid?: number;
  spread_bps?: number;
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

  /**
   * Primary source, then optional fallback. The configured spread (basis
   * points) is subtracted so FARM credited = USDC x rate x (1 - spread).
   */
  async usdcKes(env = process.env): Promise<KesRate | null> {
    const maxAge = Number(env.USDC_KES_RATE_MAX_AGE_SECONDS ?? 300) * 1000;
    if (this.cache && Date.now() - this.cache.at.getTime() < maxAge)
      return this.cache;
    const sources = [
      {
        url: env.USDC_KES_RATE_URL,
        path: env.USDC_KES_RATE_JSON_PATH,
        hdr: env.USDC_KES_RATE_HEADER,
        key: env.USDC_KES_RATE_API_KEY,
      },
      {
        url: env.USDC_KES_RATE_FALLBACK_URL,
        path: env.USDC_KES_RATE_FALLBACK_JSON_PATH,
      },
    ];
    const spreadBps = Math.min(
      Math.max(Number(env.USDC_KES_SPREAD_BPS ?? 0) || 0, 0),
      1000,
    );
    for (const s of sources) {
      const mid = await this.fetchOne(s, env);
      if (mid == null) continue;
      const rate = Math.floor(mid * (1 - spreadBps / 10_000) * 1e6) / 1e6;
      this.cache = {
        rate,
        mid,
        spread_bps: spreadBps,
        source: new URL(s.url!).host,
        at: new Date(),
      };
      return this.cache;
    }
    return null;
  }

  private async fetchOne(
    s: { url?: string; path?: string; hdr?: string; key?: string },
    env: Record<string, string | undefined>,
  ): Promise<number | null> {
    if (!s.url || !s.path || !s.url.startsWith('https://')) return null;
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (s.hdr && s.key) headers[s.hdr] = s.key; // API key sent as header, never logged
      const res = await fetch(s.url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      const v = s.path
        .split('.')
        .reduce<any>((o, k) => (o == null ? o : o[k]), body);
      const rate = Number(v);
      const min = Number(env.USDC_KES_RATE_MIN ?? 50);
      const max = Number(env.USDC_KES_RATE_MAX ?? 500);
      if (!Number.isFinite(rate) || rate < min || rate > max)
        throw new Error('rate outside sanity bounds');
      return rate;
    } catch (e: any) {
      this.log.warn(
        `Rate source ${new URL(s.url).host} unavailable: ${e?.message ?? e}`,
      );
      return null;
    }
  }
}
