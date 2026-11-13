import { Injectable, NestMiddleware, Logger, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

/** Scope the lock to the authenticated user so two users can reuse a key. */
export function idempotencyScope(req: Request): string {
  const header = req.headers.authorization;
  const token =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : '';
  if (!token) return 'anon';
  const part = token.split('.')[1];
  if (part) {
    try {
      const json = JSON.parse(
        Buffer.from(part, 'base64url').toString('utf8'),
      ) as { sub?: unknown };
      if (typeof json.sub === 'string' && json.sub.length > 0) return json.sub;
    } catch {
      // Fall through to a hash of the opaque token.
    }
  }
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = (req.method || '').toUpperCase();
    // Only enforce idempotency for unsafe methods when client provided an Idempotency-Key
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return next();

    const keyHeader =
      req.headers['idempotency-key'] ||
      req.headers['Idempotency-Key'] ||
      req.headers['Idempotency-key'];
    if (!keyHeader) return next();

    const key = `idempotency:${idempotencyScope(req)}:${String(keyHeader)}`;
    const ttl = Number(process.env.IDEMPOTENCY_KEY_TTL_MS || 60000);
    const client = this.redis?.getClient();
    if (!client) {
      this.logger.warn(
        'Idempotency middleware: no Redis client available, proceeding without lock',
      );
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
      this.logger.warn('Failed to acquire idempotency lock', e);
      return next();
    }

    const cleanup = async () => {
      try {
        const current = await client.get(key);
        if (current === value) {
          await client.del(key);
        }
      } catch (e) {
        this.logger.debug('Failed to release idempotency lock', e);
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    return next();
  }
}
