import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use client-supplied ID if present, otherwise generate one
    const requestId =
      (req.headers['x-request-id'] as string) ||
      randomBytes(12).toString('hex');

    // Attach to request so services can log it
    (req as any).requestId = requestId;

    // Send it back so clients can correlate responses
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}