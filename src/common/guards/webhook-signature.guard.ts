import {
  CanActivate, ExecutionContext, Injectable,
  UnauthorizedException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private cfg: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Determine provider from path
    if (req.path.includes('paystack')) {
      return this.verifyPaystack(req);
    }
    if (req.path.includes('ivorypay')) {
      return this.verifyIvorypay(req);
    }

    this.logger.warn(`Unknown webhook path: ${req.path}`);
    throw new UnauthorizedException('Unknown webhook provider');
  }

  private verifyPaystack(req: Request): boolean {
    const secret = this.cfg.get<string>('PAYSTACK_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET not set — rejecting webhook');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const paystackSignature = req.headers['x-paystack-signature'] as string;
    if (!paystackSignature) {
      throw new UnauthorizedException('Missing Paystack signature header');
    }

    // Paystack signs the raw body with HMAC-SHA512
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      this.logger.error('Raw body not available — ensure rawBody middleware is configured');
      throw new UnauthorizedException('Cannot verify signature without raw body');
    }

    const expected = createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');

    try {
      const sigBuffer = Buffer.from(paystackSignature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');

      if (sigBuffer.length !== expectedBuffer.length) {
        throw new UnauthorizedException('Paystack signature mismatch');
      }

      // Use timing-safe comparison to prevent timing attacks
      if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
        throw new UnauthorizedException('Paystack signature mismatch');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Paystack signature verification failed');
    }

    return true;
  }

  private verifyIvorypay(req: Request): boolean {
    const secret = this.cfg.get<string>('IVORYPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('IVORYPAY_WEBHOOK_SECRET not set — rejecting webhook');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    const signature = req.headers['x-ivorypay-signature'] as string;
    if (!signature) throw new UnauthorizedException('Missing Ivorypay signature header');

    const rawBody = (req as any).rawBody;
    if (!rawBody) throw new UnauthorizedException('Cannot verify signature without raw body');

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');
      if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
        throw new UnauthorizedException('Ivorypay signature mismatch');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Ivorypay signature verification failed');
    }

    return true;
  }
}