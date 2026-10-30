import { Injectable, Logger } from '@nestjs/common';

export interface KesRate {
  rate: number;
  mid?: number;
  spread_bps?: number;
  source: string;
  at: Date;
}

/**
 * USDC/ALGO -> KSh rate from a configured HTTPS source. No built-in or fallback
 * rate: if it is not configured or fails, conversion does not happen.
 */
@Injectable()
export class RateService {
  private readonly log = new Logger(RateService.name);
  private cache = new Map<string, KesRate>();

  /**
   * Primary source, then optional fallback. The configured spread (basis
   * points, USDC_KES_SPREAD_BPS, shared by all assets) is subtracted so
   * FARM credited = amount x rate x (1 - spread).
   */
  usdcKes(env = process.env): Promise<KesRate | null> {
    return this.kes('USDC', env, 50, 500);
  }

  /** ALGO -> KSh, same rules as USDC (ALGO_KES_RATE_* variables). */
  algoKes(env = process.env): Promise<KesRate | null> {
    return this.kes('ALGO', env, 1, 500);
  }

  private async kes(
    asset: 'USDC' | 'ALGO',
    env: Record<string, string | undefined>,
    defMin: number,
    defMax: number,
  ): Promise<KesRate | null> {
    const p = `${asset}_KES_RATE`;
    const maxAge = Number(env[`${p}_MAX_AGE_SECONDS`] ?? 300) * 1000;
    const cached = this.cache.get(asset);
    if (cached && Date.now() - cached.at.getTime() < maxAge) return cached;
    const sources = [
      {
        url: env[`${p}_URL`],
        path: env[`${p}_JSON_PATH`],
        hdr: env[`${p}_HEADER`],
        key: env[`${p}_API_KEY`],
      },
      { url: env[`${p}_FALLBACK_URL`], path: env[`${p}_FALLBACK_JSON_PATH`] },
    ];
    const spreadBps = Math.min(
      Math.max(Number(env.USDC_KES_SPREAD_BPS ?? 0) || 0, 0),
      1000,
    );
    const bounds = {
      min: Number(env[`${p}_MIN`] ?? defMin),
      max: Number(env[`${p}_MAX`] ?? defMax),
    };
    for (const s of sources) {
      const mid = await this.fetchOne(s, bounds);
      if (mid == null) continue;
      const rate = Math.floor(mid * (1 - spreadBps / 10_000) * 1e6) / 1e6;
      const r: KesRate = {
        rate,
        mid,
        spread_bps: spreadBps,
        source: new URL(s.url!).host,
        at: new Date(),
      };
      this.cache.set(asset, r);
      return r;
    }
    return null;
  }

  private async fetchOne(
    s: { url?: string; path?: string; hdr?: string; key?: string },
    bounds: { min: number; max: number },
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
      if (!Number.isFinite(rate) || rate < bounds.min || rate > bounds.max)
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
