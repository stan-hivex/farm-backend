import { CanActivate, ExecutionContext, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TurnstileService } from '../services/turnstile.service';

/**
 * Guard that validates Turnstile token from request body
 * Extracts token from cf_turnstile_response or turnstile_token fields
 * Useful for public endpoints (registration, login, password reset)
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(private turnstile: TurnstileService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body || {};
    const ip = request.ip || request.connection?.remoteAddress || undefined;

    // Extract token from either field (Cloudflare or alternate)
    const token = body.cf_turnstile_response || body.turnstile_token;

    if (!token) {
      this.logger.warn(`Turnstile token missing from ${request.method} ${request.path} IP=${ip}`);
      throw new BadRequestException('Turnstile token required');
    }

    try {
      const verification = await this.turnstile.verifyToken(token, ip);
      // Attach to request for logging/audit
      (request as any).turnstileVerification = verification;
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Turnstile verification error: ${message}`);
      throw new BadRequestException('Captcha verification failed');
    }
  }
}
