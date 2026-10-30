import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/**
 * IvoryPay has been retired. While IVORYPAY_RETIRED is on (the default; set it
 * to "false" to turn this off) every IvoryPay route, including the legacy
 * /api/v1/crypto/* IvoryPay deposit API and all IvoryPay webhook endpoints,
 * answers 410 Gone before reaching any controller or guard.
 * NOWPayments crypto routes (/wallet/deposit/crypto, withdraw/crypto) are not
 * affected, and neither are the admin legacy-withdrawal refund tools.
 */
export const IVORYPAY_RETIRED_PATH =
  /^\/api(?:\/v\d+)?\/(?:(?:[^/?]+\/)*ivorypay(?:[/?]|$)|crypto(?:[/?]|$))/i;

export function isIvorypayRetiredPath(path: string): boolean {
  return IVORYPAY_RETIRED_PATH.test(path);
}

@Injectable()
export class IvorypayRetiredMiddleware implements NestMiddleware {
  constructor(private readonly cfg: ConfigService) {}

  private get enabled(): boolean {
    const raw = this.cfg.get<string>('IVORYPAY_RETIRED');
    return (raw ?? 'true').trim().toLowerCase() !== 'false';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.enabled && isIvorypayRetiredPath(req.originalUrl || req.url)) {
      res.status(410).json({
        statusCode: 410,
        error: 'Gone',
        message:
          'IvoryPay is no longer supported. Use the NOWPayments crypto endpoints instead.',
      });
      return;
    }
    next();
  }
}
