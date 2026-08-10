import { Injectable, NestMiddleware, Logger, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = (req.method || '').toUpperCase();
    // Only enforce idempotency for unsafe methods when client provided an Idempotency-Key
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return next();

    const keyHeader = req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key'];
    if (!keyHeader) return next();

    const key = `idempotency:${String(keyHeader)}`;
    const ttl = Number(process.env.IDEMPOTENCY_KEY_TTL_MS || 60000);
    const client = this.redis?.getClient();
    if (!client) {
      this.logger.warn('Idempotency middleware: no Redis client available, proceeding without lock');
      return next();
    }

    const value = uuidv4();
    try {
      const resSet = await client.set(key, value, 'PX', ttl, 'NX');
      if (resSet !== 'OK') {
        res.status(409).json({ message: 'Duplicate request in progress' });
        return;
      }
    } catch (e) {
      this.logger.warn('Failed to acquire idempotency lock', e as any);
      return next();
    }

    const cleanup = async () => {
      try {
        const current = await client.get(key);
        if (current === value) {
          await client.del(key);
        }
      } catch (e) {
        this.logger.debug('Failed to release idempotency lock', e as any);
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    return next();
  }
}
