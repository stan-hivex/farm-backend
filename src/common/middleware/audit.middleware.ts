import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';

// Paths that trigger automatic audit logging regardless of service-level logging
const AUDITED_PATHS = [
  '/admin',
  '/kyc',
  '/payments',
  '/auth',
  '/security',
  '/users',
  '/transactions',
  '/withdraw',
  '/deposit',
  '/transfer-requests',
  '/settings',
  '/merchant',
  '/escrow',
  '/investments',
  '/wallet',
  '/device-token',
];

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditMiddleware');

  constructor(private prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const shouldAudit = AUDITED_PATHS.some((p) => req.path.includes(p));
    if (!shouldAudit || req.method === 'GET') return next();

    // Log after response is sent
    const originalSend = res.send.bind(res);
    res.send = (body: any) => {
      const user = (req as any).user;
      if (user?.id) {
        // Fire and forget — don't block the response
        this.prisma.audit_logs.create({
          data: {
            user_id: user.id,
            action: `${req.method} ${req.path}`,
            entity_type: req.path.split('/')[2] ?? 'unknown',
            ip_address: req.ip ?? null,
            user_agent: req.headers['user-agent'] ?? null,
            new_values: {
              body: this.sanitize(req.body),
              status: res.statusCode,
              request_id: (req as any).requestId,
            },
          },
        }).catch((e) => this.logger.error('Audit log failed:', e));
      }
      return originalSend(body);
    };

    next();
  }

  // Strip sensitive fields before logging
  private sanitize(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const REDACTED = ['password', 'pin', 'confirm_pin', 'otp_code', 'refresh_token',
      'access_token', 'private_key', 'mnemonic', 'secret'];
    const clean = { ...body };
    for (const key of REDACTED) {
      if (key in clean) clean[key] = '[REDACTED]';
    }
    return clean;
  }
}