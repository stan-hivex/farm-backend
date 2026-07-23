import { UseGuards } from '@nestjs/common';
import { TurnstileGuard } from '../guards/turnstile.guard';

/**
 * Decorator to require Turnstile CAPTCHA validation on a route
 * Extracts token from cf_turnstile_response or turnstile_token in request body
 *
 * Usage:
 * @Post('register')
 * @RequireTurnstile()
 * register(@Body() dto: RegisterDto) { ... }
 */
export function RequireTurnstile() {
  return UseGuards(TurnstileGuard);
}
