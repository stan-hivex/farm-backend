import { Injectable, NestMiddleware, ConflictException, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

const IDEMPOTENT_PATHS = [
  '/api/v1/wallet/send',
  '/api/v1/qr/merchant-pay',
  '/api/v1/escrow',
  '/api/v1/investments',
  '/api/v1/payments/deposit',
  '/api/v1/payments/withdraw',
  '/api/v1/deposit/create',
  '/api/v1/withdraw/create',
  '/api/v1/webhooks',
];

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOCK_SUFFIX = ':lock';
const RESPONSE_SUFFIX = ':response';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly cfg: ConfigService,
  ) {}

  private getCacheKey(key: string) {
    return `${this.cfg.get<string>('IDEMPOTENCY_PREFIX', 'idempotency:')}${key}${RESPONSE_SUFFIX}`;
  }

  private getLockKey(key: string) {
    return `${this.cfg.get<string>('IDEMPOTENCY_PREFIX', 'idempotency:')}${key}${LOCK_SUFFIX}`;
  }

  private getTtl() {
    return this.cfg.get<number>('IDEMPOTENCY_TTL_MS', DEFAULT_TTL_MS);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'POST') return next();
    const isFinancialPath = IDEMPOTENT_PATHS.some((p) => req.path.startsWith(p.replace('/api/v1', '')));
    if (!isFinancialPath) return next();

    const key = req.headers['idempotency-key'] as string;
    if (!key) return next();

    const cacheKey = this.getCacheKey(key);
    const lockKey = this.getLockKey(key);
    const ttl = this.getTtl();

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { status: number; body: any };
        res.setHeader('X-Idempotent-Replayed', 'true');
        return res.status(parsed.status).json(parsed.body);
      }

      const lockAcquired = await this.redis.set(lockKey, 'processing', 'PX', ttl, 'NX');
      if (!lockAcquired) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await this.delay(150);
          const replayValue = await this.redis.get(cacheKey);
          if (replayValue) {
            const parsed = JSON.parse(replayValue) as { status: number; body: any };
            res.setHeader('X-Idempotent-Replayed', 'true');
            return res.status(parsed.status).json(parsed.body);
          }
        }

        throw new ConflictException('Idempotency key is already being processed');
      }

      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const payload = JSON.stringify({ status: res.statusCode, body });
        void this.redis
          .multi()
          .set(cacheKey, payload, 'PX', ttl)
          .del(lockKey)
          .exec()
          .catch(() => null);
        return originalJson(body);
      };

      return next();
    } catch (error) {
      if (error instanceof ConflictException) {
        res.setHeader('X-Idempotent-Conflict', 'true');
        return res.status(409).json({ message: error.message });
      }

      return next();
    }
  }
}
